//! Document conversion: md/txt -> HTML (pulldown-cmark), docx -> plain text (quick-xml).
//! Reduced desktop scope vs the server (no PDF output): honest Spanish errors
//! for unsupported combinations.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use super::{build_output_filename, EngineOutput};

fn html_page(title: &str, body: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<style>
  body {{ font-family: system-ui, -apple-system, sans-serif; line-height: 1.65; max-width: 48rem; margin: 2.5rem auto; padding: 0 1.25rem; color: #18181b; }}
  h1, h2, h3 {{ color: #09090b; line-height: 1.25; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
  th, td {{ border: 1px solid #e4e4e7; padding: 0.5rem; text-align: left; }}
</style>
</head>
<body>
{body}
</body>
</html>"#
    )
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Extract plain text from a .docx by concatenating w:t runs (formatting dropped).
pub(crate) fn docx_to_text(input: &Path) -> Result<String, String> {
    let file = File::open(input).map_err(|_| String::from("No se pudo leer el documento."))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| String::from("El archivo DOCX está dañado o no es válido."))?;
    let mut xml = archive
        .by_name("word/document.xml")
        .map_err(|_| String::from("El archivo DOCX está dañado o no es válido."))?;
    let mut buf = String::new();
    xml.read_to_string(&mut buf)
        .map_err(|_| String::from("El archivo DOCX está dañado o no es válido."))?;

    let mut reader = quick_xml::Reader::from_str(&buf);
    let mut out = String::new();
    let mut in_text = false;
    let mut chunk = Vec::new();
    loop {
        match reader.read_event_into(&mut chunk) {
            Ok(quick_xml::events::Event::Start(e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text = true;
                }
            }
            Ok(quick_xml::events::Event::End(e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text = false;
                } else if e.name().as_ref() == b"w:p" && !out.is_empty() && !out.ends_with('\n') {
                    out.push('\n');
                }
            }
            Ok(quick_xml::events::Event::Empty(e)) => {
                if e.name().as_ref() == b"w:br" || e.name().as_ref() == b"w:tab" {
                    out.push(if e.name().as_ref() == b"w:br" {
                        '\n'
                    } else {
                        '\t'
                    });
                }
            }
            Ok(quick_xml::events::Event::Text(e)) => {
                if in_text {
                    out.push_str(
                        &e.decode().map_err(|_| {
                            String::from("El archivo DOCX contiene texto no válido.")
                        })?,
                    );
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => return Err(String::from("El archivo DOCX está dañado o no es válido.")),
            _ => {}
        }
        chunk.clear();
    }
    Ok(out)
}

pub fn process(
    input: &Path,
    original_name: &str,
    target_format: &str,
    workdir: &Path,
) -> Result<EngineOutput, String> {
    let in_ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_lowercase();
    let out_fmt = target_format.to_lowercase();

    match (in_ext.as_str(), out_fmt.as_str()) {
        ("md", "html") => {
            let md = std::fs::read_to_string(input)
                .map_err(|_| String::from("No se pudo leer el documento."))?;
            let mut body = String::new();
            pulldown_cmark::html::push_html(&mut body, pulldown_cmark::Parser::new(&md));
            let page = html_page(original_name, &body);
            let out_path = workdir.join("output-doc.html");
            std::fs::write(&out_path, page)
                .map_err(|_| String::from("No se pudo escribir el documento HTML."))?;
            Ok(EngineOutput {
                path: out_path,
                filename: build_output_filename(original_name, "html", None),
                mime: String::from("text/html;charset=utf-8"),
                details: String::from("Documento HTML5 semántico"),
            })
        }
        ("txt", "html") => {
            let raw = std::fs::read_to_string(input)
                .map_err(|_| String::from("No se pudo leer el documento."))?;
            let body: Vec<String> = raw
                .split("\n\n")
                .map(|p| format!("<p>{}</p>", escape_html(p).replace('\n', "<br/>")))
                .collect();
            let page = html_page(&escape_html(original_name), &body.join("\n"));
            let out_path = workdir.join("output-doc.html");
            std::fs::write(&out_path, page)
                .map_err(|_| String::from("No se pudo escribir el documento HTML."))?;
            Ok(EngineOutput {
                path: out_path,
                filename: build_output_filename(original_name, "html", None),
                mime: String::from("text/html;charset=utf-8"),
                details: String::from("Documento HTML5 semántico"),
            })
        }
        ("docx", "txt") => {
            let text = docx_to_text(input)?;
            let out_path = workdir.join("output-doc.txt");
            std::fs::write(&out_path, &text)
                .map_err(|_| String::from("No se pudo escribir el archivo de texto."))?;
            Ok(EngineOutput {
                path: out_path,
                filename: build_output_filename(original_name, "txt", None),
                mime: String::from("text/plain;charset=utf-8"),
                details: String::from("Texto extraído sin formato"),
            })
        }
        _ => Err(String::from(
            "Conversión no compatible en escritorio: usa Markdown o texto a HTML, o DOCX a texto plano.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn workdir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("kastral-doc-test-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn md_to_html_renders_headings() {
        let dir = workdir("md");
        let input = dir.join("nota.md");
        std::fs::write(&input, "# Hola\n\nTexto **fuerte**.").unwrap();
        let out = process(&input, "nota.md", "html", &dir).unwrap();
        let html = std::fs::read_to_string(&out.path).unwrap();
        assert!(html.contains("<h1>Hola</h1>"));
        assert_eq!(out.mime, "text/html;charset=utf-8");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn docx_to_txt_concatenates_runs() {
        let dir = workdir("docx");
        let input = dir.join("doc.docx");
        // Minimal valid .docx: zip with word/document.xml.
        let file = File::create(&input).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file(
            "word/document.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(
            br#"<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hola </w:t></w:r><w:r><w:t>mundo</w:t></w:r></w:p></w:body></w:document>"#,
        )
        .unwrap();
        zip.finish().unwrap();
        let out = process(&input, "doc.docx", "txt", &dir).unwrap();
        let text = std::fs::read_to_string(&out.path).unwrap();
        assert!(text.contains("Hola mundo"));
        assert_eq!(out.details, "Texto extraído sin formato");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unsupported_combo_is_honest() {
        let dir = workdir("bad");
        let input = dir.join("a.md");
        std::fs::write(&input, "x").unwrap();
        let err = process(&input, "a.md", "pdf", &dir).unwrap_err();
        assert!(err.contains("no compatible"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
