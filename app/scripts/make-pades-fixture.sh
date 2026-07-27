#!/usr/bin/env bash
# Builds the PAdES test fixture for the M0 spike.
#
# Produces a two-level certificate chain that mimics the shape of a real
# qualified certificate from a Czech QTSP — nonRepudiation key usage, a
# subject serialNumber carrying the identity, and the ETSI EN 319 412-5
# QCStatements (QcCompliance / QcSSCD / QcType=esign) that mark a certificate
# as qualified — then signs a PDF with it.
#
# NOTE: this chain is NOT trusted by anyone. It exercises parsing and identity
# extraction only. Real QES validation is an external-validator concern in the
# MVP; see docs/m0-spike.md.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=src/spikes/fixtures
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# ETSI EN 319 412-5 QCStatements, DER-encoded by hand:
#   SEQUENCE {
#     SEQUENCE { OID 0.4.0.1862.1.1 }               -- QcCompliance
#     SEQUENCE { OID 0.4.0.1862.1.4 }               -- QcSSCD
#     SEQUENCE { OID 0.4.0.1862.1.6,                -- QcType
#                SEQUENCE { OID 0.4.0.1862.1.6.1 } }  -- ... esign
#   }
QCSTATEMENTS="30293008060604008E4601013008060604008E4601043013060604008E46010630090607\
04008E46010601"

cat > "$WORK/ca.cnf" <<'EOF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = v3_ca
[dn]
C  = CZ
O  = xNotary Test QTSP a.s.
CN = xNotary Test Qualified CA 2/RSA 02/2026
[v3_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
EOF

cat > "$WORK/leaf.cnf" <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
C  = CZ
O  = xNotary Test QTSP a.s.
CN = Jan Novak
serialNumber = ICA - 10123456
[v3_leaf]
basicConstraints = critical,CA:FALSE
# nonRepudiation alone is the hallmark of a signature (not authentication) cert.
keyUsage = critical,nonRepudiation
extendedKeyUsage = emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
subjectAltName = email:jan.novak@example.cz
certificatePolicies = 0.4.0.194112.1.2
1.3.6.1.5.5.7.1.3 = DER:$QCSTATEMENTS
EOF

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$WORK/ca.key" -out "$WORK/ca.crt" -config "$WORK/ca.cnf" 2>/dev/null

openssl req -newkey rsa:2048 -nodes -keyout "$WORK/leaf.key" -out "$WORK/leaf.csr" \
  -config "$WORK/leaf.cnf" 2>/dev/null

openssl x509 -req -in "$WORK/leaf.csr" -CA "$WORK/ca.crt" -CAkey "$WORK/ca.key" \
  -CAcreateserial -days 730 -sha256 \
  -extfile "$WORK/leaf.cnf" -extensions v3_leaf -out "$WORK/leaf.crt" 2>/dev/null

# Sanity-check that the hand-rolled QCStatements DER actually parses. `x509
# -text` will not decode an extension OpenSSL has no printer for, so parse the
# raw DER instead.
echo "$QCSTATEMENTS" | xxd -r -p | openssl asn1parse -inform der 2>/dev/null \
  | grep -q "0.4.0.1862.1.1" \
  || { echo "QCStatements did not encode correctly" >&2; exit 1; }

openssl pkcs12 -export -out "$WORK/signer.p12" -inkey "$WORK/leaf.key" \
  -in "$WORK/leaf.crt" -certfile "$WORK/ca.crt" -passout pass:xnotary -legacy 2>/dev/null \
  || openssl pkcs12 -export -out "$WORK/signer.p12" -inkey "$WORK/leaf.key" \
     -in "$WORK/leaf.crt" -certfile "$WORK/ca.crt" -passout pass:xnotary 2>/dev/null

mkdir -p "$OUT"
node scripts/sign-fixture.mjs "$WORK/signer.p12" "$OUT/signed-sample.pdf"
echo "wrote $OUT/signed-sample.pdf"
