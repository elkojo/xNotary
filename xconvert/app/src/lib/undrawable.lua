-- For PDF only: Typst draws PNG, JPEG, GIF, WebP, SVG and PDF images. Anything else —
-- Word's EMF and WMF drawings above all, TIFF, BMP — would stop the whole document from
-- typesetting. Each such image is replaced by a visible note saying what was left out,
-- and logged, so the reader sees the list. Nothing is dropped silently.
local drawable = { png = true, jpg = true, jpeg = true, gif = true, webp = true, svg = true, pdf = true }

function Image(image)
  local extension = (image.src:match('%.([%w]+)$') or ''):lower()
  if drawable[extension] then
    return nil
  end
  local kind = extension ~= '' and extension:upper() or 'unknown format'
  local described = pandoc.utils.stringify(image.caption)
  pandoc.log.warn(
    'Image not shown in the PDF: ' .. image.src .. ' is ' .. kind ..
    ', which the typesetter cannot draw. Convert it to PNG or SVG in the original to keep it.'
  )
  local note = '[Image not shown: ' .. kind .. (described ~= '' and (' — ' .. described) or '') .. ']'
  return pandoc.Emph({ pandoc.Str(note) })
end
