//! Typst source, its images and its fonts in; a PDF — PDF/A-2b by default — out.
//!
//! Built for xConvert, which runs this in a browser Web Worker. There is deliberately no
//! wasm-bindgen: its glue builds JavaScript functions from strings, which the site's CSP
//! forbids. The interface is a handful of `extern "C"` functions over linear memory instead,
//! and the module imports nothing from JavaScript at all — so it cannot reach the network,
//! the clock or anything else the caller did not hand it.
//!
//! Calling convention: allocate with `xc_alloc`, copy bytes in, call, free with `xc_free`.
//! `xc_compile` leaves its output (PDF bytes, or UTF-8 diagnostics) for `xc_output_ptr` and
//! `xc_output_len` to read until the next call.

use std::cell::RefCell;
use std::collections::HashMap;

use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Smart};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World, WorldExt};
use typst_layout::PagedDocument;
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards, Timestamp};

const MAIN: &str = "/main.typ";

/// Everything the caller has handed over so far.
#[derive(Default)]
struct State {
    fonts: Vec<Font>,
    files: HashMap<String, Bytes>,
    output: Vec<u8>,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

fn id_for(path: &str) -> Option<FileId> {
    Some(RootedPath::new(VirtualRoot::Project, VirtualPath::new(path).ok()?).intern())
}

struct XWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main: FileId,
    source: Source,
    files: HashMap<FileId, Bytes>,
    today: Option<Datetime>,
}

impl World for XWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }
    fn main(&self) -> FileId {
        self.main
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main {
            Ok(self.source.clone())
        } else {
            Err(FileError::NotSource)
        }
    }
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        self.files
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(id.vpath().get_without_slash().into()))
    }
    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
    fn today(&self, _offset: Option<typst::foundations::Duration>) -> Option<Datetime> {
        self.today
    }
}

/// # Safety
/// Returns memory the caller must give back with `xc_free(ptr, len)`.
#[no_mangle]
pub extern "C" fn xc_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` and `len` must come from one `xc_alloc` call.
#[no_mangle]
pub unsafe extern "C" fn xc_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
}

unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if len == 0 { &[] } else { std::slice::from_raw_parts(ptr, len) }
}

/// Adds every face in a font file. Returns how many were found (0: not a font).
#[no_mangle]
pub unsafe extern "C" fn xc_add_font(ptr: *const u8, len: usize) -> u32 {
    let data = Bytes::new(bytes(ptr, len).to_vec());
    STATE.with_borrow_mut(|s| {
        let before = s.fonts.len();
        s.fonts.extend(Font::iter(data));
        (s.fonts.len() - before) as u32
    })
}

/// Makes a file (an image, typically) readable by the document at `path`.
#[no_mangle]
pub unsafe extern "C" fn xc_add_file(path_ptr: *const u8, path_len: usize, ptr: *const u8, len: usize) -> u32 {
    let Ok(path) = std::str::from_utf8(bytes(path_ptr, path_len)) else { return 0 };
    let data = Bytes::new(bytes(ptr, len).to_vec());
    STATE.with_borrow_mut(|s| s.files.insert(path.to_owned(), data));
    1
}

/// Forgets every file added since the last reset. Fonts stay.
#[no_mangle]
pub extern "C" fn xc_reset_files() {
    STATE.with_borrow_mut(|s| s.files.clear());
}

fn describe<'a>(diagnostics: impl IntoIterator<Item = &'a SourceDiagnostic>, world: &XWorld) -> String {
    diagnostics
        .into_iter()
        .map(|d| {
            let line = world
                .range(d.span)
                .and_then(|r| world.source.lines().byte_to_line(r.start))
                .map(|l| format!(" (line {})", l + 1))
                .unwrap_or_default();
            let mut text = format!("{:?}{line}: {}", d.severity, d.message);
            for hint in &d.hints {
                text.push_str(&format!("\n  hint: {}", hint.v));
            }
            text
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Compiles the Typst source at `src` to PDF.
///
/// `standard`: 0 = plain PDF, 1 = PDF/A-2b. The date is the caller's, in UTC; Typst uses it
/// for `datetime.today()` and the PDF's creation date, and PDF/A requires one.
///
/// Returns 0 with the PDF as output, or 1 with the diagnostics as output.
#[no_mangle]
pub unsafe extern "C" fn xc_compile(
    src_ptr: *const u8,
    src_len: usize,
    standard: u32,
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> u32 {
    let text = String::from_utf8_lossy(bytes(src_ptr, src_len)).into_owned();
    let main = id_for(MAIN).expect("a valid main path");
    let source = Source::new(main, text);
    let now = Datetime::from_ymd_hms(year, month as u8, day as u8, hour as u8, minute as u8, second as u8);

    let (fonts, files) = STATE.with_borrow(|s| {
        let files = s.files.iter().filter_map(|(p, b)| Some((id_for(p)?, b.clone()))).collect();
        (s.fonts.clone(), files)
    });
    let world = XWorld {
        library: LazyHash::new(Library::default()),
        book: LazyHash::new(FontBook::from_fonts(&fonts)),
        fonts,
        main,
        source: source.clone(),
        files,
        today: now.map(|d| Datetime::from_ymd(d.year().unwrap_or(1970), d.month().unwrap_or(1), d.day().unwrap_or(1)).unwrap_or(d)),
    };

    let result = (|| -> Result<Vec<u8>, String> {
        let warned = typst::compile::<PagedDocument>(&world);
        let document = warned.output.map_err(|e| describe(&e, &world))?;
        let standards = match standard {
            0 => PdfStandards::default(),
            1 => PdfStandards::new(&[PdfStandard::A_2b]).map_err(|e| e.message().to_string())?,
            n => return Err(format!("unknown PDF standard {n}")),
        };
        let options = PdfOptions {
            ident: Smart::Auto,
            creator: Smart::Custom(Some("xConvert (pandoc + Typst)".into())),
            timestamp: now.map(Timestamp::new_utc),
            standards,
            ..PdfOptions::default()
        };
        typst_pdf::pdf(&document, &options).map_err(|e| describe(&e, &world))
    })();

    STATE.with_borrow_mut(|s| match result {
        Ok(pdf) => {
            s.output = pdf;
            0
        }
        Err(message) => {
            s.output = message.into_bytes();
            1
        }
    })
}

#[no_mangle]
pub extern "C" fn xc_output_ptr() -> *const u8 {
    STATE.with_borrow(|s| s.output.as_ptr())
}

#[no_mangle]
pub extern "C" fn xc_output_len() -> usize {
    STATE.with_borrow(|s| s.output.len())
}
