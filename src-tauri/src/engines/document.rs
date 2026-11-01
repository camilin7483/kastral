//! Document conversion: docx/md/txt -> HTML, plain text or PDF.
//! PDF output uses genpdf (pure Rust, no external binaries): A4 pages with an
//! embedded system serif font. Tables and drawings inside .docx are skipped and
//! reported honestly in `details`. All errors are user-facing Spanish messages.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use super::{build_output_filename, EngineOutput};

/// A rich-text run with bold/italic preserved from docx (`w:b`/`w:i`)
/// and Markdown emphasis.
#[derive(Debug, Clone, PartialEq)]
struct Run {
    text: String,
    bold: bool,
    italic: bool,
}

impl Run {
    fn plain(text: &str) -> Self {
        Self {
            text: text.to_string(),
            bold: false,
            italic: false,
        }
    }
}

/// Shared block model every input is parsed into and every output renders from.
#[derive(Debug, Clone, PartialEq)]
enum Block {
    Heading(String),
    Paragraph(Vec<Run>),
}

/// Parsed .docx body plus whether tables/drawings were skipped.
struct DocxBlocks {
    blocks: Vec<Block>,
    omitted: bool,
}

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

/// Read `word/document.xml` from a .docx (zip) file.
fn read_document_xml(input: &Path) -> Result<String, String> {
    let file = File::open(input).map_err(|_| String::from("No se pudo leer el documento."))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| String::from("El archivo DOCX está dañado o no es válido."))?;
    let mut xml = archive
        .by_name("word/document.xml")
        .map_err(|_| String::from("El archivo DOCX está dañado o no es válido."))?;
    let mut buf = String::new();
    xml.read_to_string(&mut buf)
        .map_err(|_| String::from("El archivo DOCX está dañado o no es válido."))?;
    Ok(buf)
}

fn is_heading_style(val: &str) -> bool {
    let v = val.to_lowercase();
    v.starts_with("heading")
        || v.starts_with("titulo")
        || v.starts_with("título")
        || v.starts_with("encabezado")
}

fn is_off(val: &str) -> bool {
    matches!(val.to_lowercase().as_str(), "false" | "0" | "off" | "none")
}

fn style_val(e: &quick_xml::events::BytesStart<'_>) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == b"w:val")
        .and_then(|a| std::str::from_utf8(&a.value).ok().map(str::to_string))
}

/// Parse `word/document.xml` into blocks: `w:p` paragraphs, `Heading*` styles
/// to headings, `w:r` runs with `w:b`/`w:i`. Tables, drawings and pictures
/// (`w:tbl`, `w:drawing`, `w:pict`) carry no body text here and are skipped.
fn parse_docx_blocks(xml: &str) -> Result<DocxBlocks, String> {
    use quick_xml::events::Event;
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut out = DocxBlocks {
        blocks: Vec::new(),
        omitted: false,
    };
    let mut chunk = Vec::new();
    let mut ignore = 0u32;
    let mut in_p = false;
    let mut heading = false;
    let mut runs: Vec<Run> = Vec::new();
    let mut in_r = false;
    let mut text = String::new();
    let mut bold = false;
    let mut italic = false;
    let mut in_t = false;
    loop {
        match reader.read_event_into(&mut chunk) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"w:tbl" | b"w:drawing" | b"w:pict" => {
                    ignore += 1;
                    out.omitted = true;
                }
                b"w:p" if ignore == 0 => {
                    in_p = true;
                    heading = false;
                    runs.clear();
                }
                b"w:pStyle" if in_p && ignore == 0 => {
                    if let Some(v) = style_val(&e) {
                        heading = is_heading_style(&v);
                    }
                }
                b"w:r" if in_p && ignore == 0 => {
                    in_r = true;
                    text.clear();
                    bold = false;
                    italic = false;
                }
                b"w:b" if in_r && ignore == 0 => {
                    bold = style_val(&e).map(|v| !is_off(&v)).unwrap_or(true);
                }
                b"w:i" if in_r && ignore == 0 => {
                    italic = style_val(&e).map(|v| !is_off(&v)).unwrap_or(true);
                }
                b"w:t" if in_r && ignore == 0 => in_t = true,
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.name().as_ref() {
                b"w:tbl" | b"w:drawing" | b"w:pict" => out.omitted = true,
                b"w:pStyle" if in_p && ignore == 0 => {
                    if let Some(v) = style_val(&e) {
                        heading = is_heading_style(&v);
                    }
                }
                b"w:b" if in_r && ignore == 0 => {
                    bold = style_val(&e).map(|v| !is_off(&v)).unwrap_or(true);
                }
                b"w:i" if in_r && ignore == 0 => {
                    italic = style_val(&e).map(|v| !is_off(&v)).unwrap_or(true);
                }
                b"w:br" if in_r && ignore == 0 => text.push('\n'),
                b"w:tab" if in_r && ignore == 0 => text.push('\t'),
                _ => {}
            },
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"w:tbl" | b"w:drawing" | b"w:pict" => {
                    ignore = ignore.saturating_sub(1);
                }
                b"w:t" => in_t = false,
                b"w:r" if in_r && ignore == 0 => {
                    in_r = false;
                    if !text.is_empty() {
                        runs.push(Run {
                            text: std::mem::take(&mut text),
                            bold,
                            italic,
                        });
                    }
                }
                b"w:p" if in_p && ignore == 0 => {
                    in_p = false;
                    in_r = false;
                    in_t = false;
                    if runs.iter().any(|r| !r.text.trim().is_empty()) {
                        if heading {
                            let joined: String = runs.iter().map(|r| r.text.as_str()).collect();
                            out.blocks.push(Block::Heading(joined.trim().to_string()));
                        } else {
                            out.blocks.push(Block::Paragraph(std::mem::take(&mut runs)));
                        }
                    }
                    runs.clear();
                }
                _ => {}
            },
            Ok(Event::Text(e)) => {
                if in_t && in_r && in_p && ignore == 0 {
                    text.push_str(
                        &e.decode().map_err(|_| {
                            String::from("El archivo DOCX contiene texto no válido.")
                        })?,
                    );
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return Err(String::from("El archivo DOCX está dañado o no es válido.")),
            _ => {}
        }
        chunk.clear();
    }
    Ok(out)
}

/// Parse Markdown into blocks: headings, paragraphs with emphasis, and list
/// items as paragraphs prefixed with "• ".
fn md_to_blocks(md: &str) -> Vec<Block> {
    use pulldown_cmark::{Event, Tag, TagEnd};
    let mut blocks: Vec<Block> = Vec::new();
    let mut runs: Vec<Run> = Vec::new();
    let mut in_block = false;
    let mut is_heading = false;
    let mut bold_depth = 0u32;
    let mut italic_depth = 0u32;
    let mut pending_bullet = false;

    // Push the accumulated runs as one block; empty (whitespace-only) runs are dropped.
    let flush = |runs: &mut Vec<Run>, blocks: &mut Vec<Block>, is_heading: bool| {
        if !runs.iter().any(|r| !r.text.trim().is_empty()) {
            runs.clear();
            return;
        }
        if is_heading {
            let joined: String = runs.iter().map(|r| r.text.as_str()).collect();
            blocks.push(Block::Heading(joined.trim().to_string()));
        } else {
            blocks.push(Block::Paragraph(std::mem::take(runs)));
        }
        runs.clear();
    };

    let push_text = |runs: &mut Vec<Run>,
                     chunk: &str,
                     bold_depth: u32,
                     italic_depth: u32,
                     pending_bullet: &mut bool| {
        let mut piece = chunk.to_string();
        if *pending_bullet {
            piece = format!("• {piece}");
            *pending_bullet = false;
        }
        runs.push(Run {
            text: piece,
            bold: bold_depth > 0,
            italic: italic_depth > 0,
        });
    };

    for event in pulldown_cmark::Parser::new(md) {
        match event {
            Event::Start(Tag::Heading { .. }) => {
                flush(&mut runs, &mut blocks, is_heading);
                in_block = true;
                is_heading = true;
            }
            Event::Start(Tag::Paragraph) | Event::Start(Tag::CodeBlock(_)) => {
                flush(&mut runs, &mut blocks, is_heading);
                in_block = true;
                is_heading = false;
            }
            Event::Start(Tag::Item) => {
                flush(&mut runs, &mut blocks, is_heading);
                in_block = true;
                is_heading = false;
                pending_bullet = true;
            }
            Event::Start(Tag::Strong) => bold_depth += 1,
            Event::Start(Tag::Emphasis) => italic_depth += 1,
            Event::End(TagEnd::Heading(_))
            | Event::End(TagEnd::Paragraph)
            | Event::End(TagEnd::Item)
            | Event::End(TagEnd::CodeBlock) => {
                flush(&mut runs, &mut blocks, is_heading);
                in_block = false;
                is_heading = false;
                pending_bullet = false;
            }
            Event::End(TagEnd::Strong) => bold_depth = bold_depth.saturating_sub(1),
            Event::End(TagEnd::Emphasis) => italic_depth = italic_depth.saturating_sub(1),
            Event::Text(t) | Event::Code(t) => {
                if !in_block {
                    in_block = true;
                    is_heading = false;
                }
                push_text(&mut runs, &t, bold_depth, italic_depth, &mut pending_bullet);
            }
            Event::SoftBreak => {
                if in_block {
                    push_text(
                        &mut runs,
                        " ",
                        bold_depth,
                        italic_depth,
                        &mut pending_bullet,
                    );
                }
            }
            Event::HardBreak => {
                if in_block {
                    push_text(
                        &mut runs,
                        "\n",
                        bold_depth,
                        italic_depth,
                        &mut pending_bullet,
                    );
                }
            }
            Event::TaskListMarker(done) => {
                if !in_block {
                    in_block = true;
                    is_heading = false;
                }
                push_text(
                    &mut runs,
                    if done { "☑ " } else { "☐ " },
                    bold_depth,
                    italic_depth,
                    &mut pending_bullet,
                );
            }
            _ => {}
        }
    }
    flush(&mut runs, &mut blocks, is_heading);
    blocks
}

/// Parse plain text into blocks: paragraphs split on blank lines.
fn txt_to_blocks(raw: &str) -> Vec<Block> {
    raw.replace('\r', "")
        .split("\n\n")
        .filter_map(|p| {
            if p.trim().is_empty() {
                None
            } else {
                Some(Block::Paragraph(vec![Run::plain(p)]))
            }
        })
        .collect()
}

/// Render blocks as plain text (paragraphs joined with newlines).
fn blocks_to_text(blocks: &[Block]) -> String {
    blocks
        .iter()
        .map(|b| match b {
            Block::Heading(s) => s.clone(),
            Block::Paragraph(runs) => runs.iter().map(|r| r.text.as_str()).collect(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Render blocks as a full HTML5 page (headings to `<h1>`, runs to
/// `<strong>`/`<em>`).
fn blocks_to_html(title: &str, blocks: &[Block]) -> String {
    let mut body = String::new();
    for block in blocks {
        match block {
            Block::Heading(s) => {
                body.push_str(&format!("<h1>{}</h1>\n", escape_html(s)));
            }
            Block::Paragraph(runs) => {
                if !runs.iter().any(|r| !r.text.trim().is_empty()) {
                    continue;
                }
                let mut p = String::new();
                for r in runs {
                    let mut t = escape_html(&r.text).replace('\n', "<br/>");
                    if r.bold {
                        t = format!("<strong>{t}</strong>");
                    }
                    if r.italic {
                        t = format!("<em>{t}</em>");
                    }
                    p.push_str(&t);
                }
                body.push_str(&format!("<p>{p}</p>\n"));
            }
        }
    }
    html_page(&escape_html(title), &body)
}

fn load_font_bytes(candidates: &[&str]) -> Option<Vec<u8>> {
    candidates.iter().find_map(|p| std::fs::read(p).ok())
}

/// System serif font embedded in the PDF. Missing bold/italic variants fall
/// back to the regular face so conversion never fails for styling reasons.
fn default_font_family() -> Result<genpdf::fonts::FontFamily<genpdf::fonts::FontData>, String> {
    const REGULAR: &[&str] = &[
        "/usr/share/fonts/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "C:/Windows/Fonts/times.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/Library/Fonts/Times New Roman.ttf",
    ];
    const BOLD: &[&str] = &[
        "/usr/share/fonts/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "/Library/Fonts/Times New Roman Bold.ttf",
    ];
    const ITALIC: &[&str] = &[
        "/usr/share/fonts/liberation/LiberationSerif-Italic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
        "/usr/share/fonts/TTF/DejaVuSerif-Italic.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
        "C:/Windows/Fonts/timesi.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
        "/Library/Fonts/Times New Roman Italic.ttf",
    ];
    const BOLD_ITALIC: &[&str] = &[
        "/usr/share/fonts/liberation/LiberationSerif-BoldItalic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
        "/usr/share/fonts/TTF/DejaVuSerif-BoldItalic.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
        "C:/Windows/Fonts/timesbi.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf",
        "/Library/Fonts/Times New Roman Bold Italic.ttf",
    ];
    let regular = load_font_bytes(REGULAR).ok_or_else(|| {
        String::from("No se encontró una fuente del sistema para generar el PDF.")
    })?;
    let font_data = |bytes: Vec<u8>| {
        genpdf::fonts::FontData::new(bytes, None)
            .map_err(|_| String::from("La fuente del sistema no es válida para generar el PDF."))
    };
    let bold_data = load_font_bytes(BOLD).unwrap_or_else(|| regular.clone());
    let italic_data = load_font_bytes(ITALIC).unwrap_or_else(|| regular.clone());
    let bold_italic_data = load_font_bytes(BOLD_ITALIC).unwrap_or_else(|| regular.clone());
    Ok(genpdf::fonts::FontFamily {
        regular: font_data(regular)?,
        bold: font_data(bold_data)?,
        italic: font_data(italic_data)?,
        bold_italic: font_data(bold_italic_data)?,
    })
}

/// Render blocks to PDF bytes: A4 page, headings larger and bold, default
/// line spacing.
fn blocks_to_pdf(title: &str, blocks: &[Block]) -> Result<Vec<u8>, String> {
    use genpdf::{elements, style};
    let mut doc = genpdf::Document::new(default_font_family()?);
    doc.set_title(title);
    let mut pushed = false;
    for block in blocks {
        match block {
            Block::Heading(s) => {
                doc.push(
                    elements::Paragraph::default()
                        .styled_string(s.clone(), style::Style::new().bold().with_font_size(18)),
                );
            }
            Block::Paragraph(runs) => {
                if !runs.iter().any(|r| !r.text.is_empty()) {
                    continue;
                }
                let mut p = elements::Paragraph::default();
                for r in runs {
                    if r.text.is_empty() {
                        continue;
                    }
                    let mut st = style::Style::new();
                    if r.bold {
                        st.set_bold();
                    }
                    if r.italic {
                        st.set_italic();
                    }
                    p.push_styled(r.text.clone(), st);
                }
                doc.push(p);
            }
        }
        doc.push(elements::Break::new(1));
        pushed = true;
    }
    if !pushed {
        doc.push(elements::Paragraph::new("(documento vacío)"));
    }
    let mut buf = Vec::new();
    doc.render(&mut buf)
        .map_err(|_| String::from("No se pudo generar el archivo PDF."))?;
    Ok(buf)
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

    let (blocks, omitted) = match in_ext.as_str() {
        "md" => {
            let md = std::fs::read_to_string(input)
                .map_err(|_| String::from("No se pudo leer el documento."))?;
            (md_to_blocks(&md), false)
        }
        "txt" => {
            let raw = std::fs::read_to_string(input)
                .map_err(|_| String::from("No se pudo leer el documento."))?;
            (txt_to_blocks(&raw), false)
        }
        "docx" => {
            let xml = read_document_xml(input)?;
            let parsed = parse_docx_blocks(&xml)?;
            (parsed.blocks, parsed.omitted)
        }
        _ => {
            return Err(String::from(
                "Tipo de documento no compatible en escritorio: usa DOCX, Markdown o texto plano.",
            ));
        }
    };
    let suffix = if omitted {
        " (tablas y dibujos omitidos)"
    } else {
        ""
    };

    match out_fmt.as_str() {
        "html" => {
            let page = blocks_to_html(original_name, &blocks);
            let out_path = workdir.join("output-doc.html");
            std::fs::write(&out_path, page)
                .map_err(|_| String::from("No se pudo escribir el documento HTML."))?;
            Ok(EngineOutput {
                path: out_path,
                filename: build_output_filename(original_name, "html", None),
                mime: String::from("text/html;charset=utf-8"),
                details: format!("Documento HTML5 semántico{suffix}"),
            })
        }
        "txt" => {
            let text = blocks_to_text(&blocks);
            let out_path = workdir.join("output-doc.txt");
            std::fs::write(&out_path, &text)
                .map_err(|_| String::from("No se pudo escribir el archivo de texto."))?;
            let base = if in_ext == "docx" {
                "Texto extraído sin formato"
            } else {
                "Texto plano"
            };
            Ok(EngineOutput {
                path: out_path,
                filename: build_output_filename(original_name, "txt", None),
                mime: String::from("text/plain;charset=utf-8"),
                details: format!("{base}{suffix}"),
            })
        }
        "pdf" => {
            let bytes = blocks_to_pdf(original_name, &blocks)?;
            let out_path = workdir.join("output-doc.pdf");
            std::fs::write(&out_path, &bytes)
                .map_err(|_| String::from("No se pudo escribir el archivo PDF."))?;
            Ok(EngineOutput {
                path: out_path,
                filename: build_output_filename(original_name, "pdf", None),
                mime: String::from("application/pdf"),
                details: format!("PDF A4 con texto y títulos{suffix}"),
            })
        }
        _ => Err(String::from(
            "Conversión no compatible en escritorio: convierte DOCX, Markdown o texto a PDF, HTML o texto plano.",
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

    fn write_min_docx(path: &Path, body_xml: &str) {
        let file = File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file(
            "word/document.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(
            format!(
                r#"<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body_xml}</w:body></w:document>"#
            )
            .as_bytes(),
        )
        .unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn md_to_html_renders_headings() {
        let dir = workdir("md");
        let input = dir.join("nota.md");
        std::fs::write(&input, "# Hola\n\nTexto **fuerte**.").unwrap();
        let out = process(&input, "nota.md", "html", &dir).unwrap();
        let html = std::fs::read_to_string(&out.path).unwrap();
        assert!(html.contains("<h1>Hola</h1>"));
        assert!(html.contains("<strong>fuerte</strong>"));
        assert_eq!(out.mime, "text/html;charset=utf-8");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn docx_to_txt_concatenates_runs() {
        let dir = workdir("docx");
        let input = dir.join("doc.docx");
        write_min_docx(
            &input,
            "<w:p><w:r><w:t>Hola </w:t></w:r><w:r><w:t>mundo</w:t></w:r></w:p>",
        );
        let out = process(&input, "doc.docx", "txt", &dir).unwrap();
        let text = std::fs::read_to_string(&out.path).unwrap();
        assert!(text.contains("Hola mundo"));
        assert_eq!(out.details, "Texto extraído sin formato");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn docx_to_pdf_is_valid_pdf() {
        let dir = workdir("docx-pdf");
        let input = dir.join("doc.docx");
        write_min_docx(
            &input,
            r#"<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Título</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Hola </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>mundo</w:t></w:r></w:p>"#,
        );
        let out = process(&input, "doc.docx", "pdf", &dir).unwrap();
        let bytes = std::fs::read(&out.path).unwrap();
        assert!(bytes.starts_with(b"%PDF"), "el PDF debe empezar por %PDF");
        assert_eq!(out.mime, "application/pdf");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn docx_tables_are_skipped_honestly() {
        let dir = workdir("docx-tbl");
        let input = dir.join("tabla.docx");
        write_min_docx(
            &input,
            "<w:p><w:r><w:t>Antes</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda</w:t></w:r></w:p></w:tc></w:tr></w:tbl>",
        );
        let out = process(&input, "tabla.docx", "pdf", &dir).unwrap();
        assert!(
            out.details.contains("omitidos"),
            "el detalle debe avisar de la omisión"
        );
        let bytes = std::fs::read(&out.path).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn md_to_pdf_with_heading_and_bold() {
        let dir = workdir("md-pdf");
        let input = dir.join("nota.md");
        std::fs::write(
            &input,
            "# Informe\n\nTexto **fuerte** y *cursiva*.\n\n- punto uno\n",
        )
        .unwrap();
        let out = process(&input, "nota.md", "pdf", &dir).unwrap();
        let bytes = std::fs::read(&out.path).unwrap();
        assert!(bytes.starts_with(b"%PDF"), "el PDF debe empezar por %PDF");
        assert!(bytes.len() > 1000, "el PDF debe tener contenido real");
        assert_eq!(out.mime, "application/pdf");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn txt_to_pdf_is_valid_pdf() {
        let dir = workdir("txt-pdf");
        let input = dir.join("nota.txt");
        std::fs::write(&input, "Primera línea.\n\nSegunda línea.").unwrap();
        let out = process(&input, "nota.txt", "pdf", &dir).unwrap();
        let bytes = std::fs::read(&out.path).unwrap();
        assert!(bytes.starts_with(b"%PDF"), "el PDF debe empezar por %PDF");
        assert_eq!(out.mime, "application/pdf");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unsupported_combo_is_honest() {
        let dir = workdir("bad");
        let input = dir.join("a.md");
        std::fs::write(&input, "x").unwrap();
        let err = process(&input, "a.md", "docx", &dir).unwrap_err();
        assert!(err.contains("no compatible"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
