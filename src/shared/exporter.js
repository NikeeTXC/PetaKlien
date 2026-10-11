/**
 * PetaKlien - Shared Exporter (XLSX / CSV / TSV)
 * Single implementation used by the content script, the popup, and the report page.
 * Depends on lead-schema.js (loaded first).
 */

(function (root) {
  "use strict";

  const schema = (root && root.PetaKlienSchema && root.PetaKlienSchema.COLUMNS)
    ? root.PetaKlienSchema
    : require("./lead-schema.js");
  const { COLUMNS, OUTREACH_STATUSES, statusKind, neutralizeFormula, safeHttpUrl } = schema;

  const COL_LETTERS = COLUMNS.map((_, i) => String.fromCharCode(65 + i)); // A..Q
  const COL_WIDTHS = [6, 36, 24, 24, 40, 40, 28, 24, 18, 22, 32, 48, 10, 15, 22, 38, 22, 40];
  const SEARCH_LABEL = "Lacak di Google Search";

  function googleSearchUrl(lead) {
    const addr = lead.address && lead.address !== "-" ? lead.address : "";
    return "https://www.google.com/search?q=" + encodeURIComponent(((lead.title || "") + " " + addr + " website resmi").trim());
  }

  /**
   * One lead -> 18 values in COLUMNS order (A..R).
   */
  function leadToRow(lead, idx) {
    return [
      idx + 1,
      lead.title || "",
      lead.category || "Instansi / Usaha",
      lead.websiteStatus || "",
      lead.websiteUrl || "-",
      lead.socialUrl || "-",
      lead.email || "-",
      lead.techStack || "-",
      lead.phone || "-",
      lead.phoneType || "-",
      lead.waUrl || "-",
      lead.address || "-",
      lead.rating || "-",
      lead.reviewsCount || "0",
      lead.outreachStatus || "Belum Dihubungi",
      lead.mapsUrl || "-",
      lead.scrapedAt || "",
      lead.note || ""
    ];
  }

  function escapeCSV(val) {
    if (val === null || val === undefined) return '""';
    return '"' + String(neutralizeFormula(val)).replace(/"/g, '""') + '"';
  }

  function toCSV(leads) {
    const lines = [COLUMNS.map(escapeCSV).join(",")];
    (leads || []).forEach((lead, idx) => lines.push(leadToRow(lead, idx).map(escapeCSV).join(",")));
    return "﻿" + lines.join("\r\n");
  }

  /**
   * Tab-separated text for pasting straight into Excel / Google Sheets.
   */
  function toTSV(leads) {
    const clean = (v) => neutralizeFormula(String(v === null || v === undefined ? "" : v).replace(/[\t\r\n]+/g, " "));
    const lines = [COLUMNS.join("\t")];
    (leads || []).forEach((lead, idx) => lines.push(leadToRow(lead, idx).map(clean).join("\t")));
    return lines.join("\n");
  }

  // --- XLSX styling (xlsx-js-style) ---

  const BORDER = (() => {
    const side = { style: "thin", color: { rgb: "E1DFDD" } };
    return { top: side, bottom: side, left: side, right: side };
  })();

  function style(fill, font, horizontal) {
    return {
      fill: { fgColor: { rgb: fill } },
      font: Object.assign({ name: "Segoe UI", sz: 10 }, font),
      alignment: { vertical: "center", horizontal: horizontal || "center" },
      border: BORDER
    };
  }

  const HEADER_STYLE = {
    fill: { fgColor: { rgb: "107C41" } },
    font: { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
    border: {
      top: { style: "medium", color: { rgb: "0B582E" } },
      bottom: { style: "medium", color: { rgb: "0B582E" } },
      left: { style: "thin", color: { rgb: "2E8540" } },
      right: { style: "thin", color: { rgb: "2E8540" } }
    }
  };

  const STATUS_COLORS = { none: ["FEE2E2", "991B1B"], social: ["FEF3C7", "92400E"], web: ["E0F2FE", "0369A1"] };
  const OUTREACH_COLORS = {
    "Terkirim WA": ["E0F2FE", "0369A1"],
    "Tertarik / Follow-Up": ["FEF9C3", "854D0E"],
    "Deal (Klien)": ["DCFCE7", "15803D"],
    "Ditolak": ["FEE2E2", "B91C1C"]
  };

  /**
   * Style + hyperlink one data cell. Returns nothing; mutates the cell.
   */
  function decorateCell(cell, col, lead, rowBg) {
    const c = (rgb) => ({ color: { rgb } });
    switch (col) {
      case "A": cell.s = style(rowBg, c("605E5C")); break;
      case "B": cell.s = style(rowBg, Object.assign({ sz: 10.5, bold: true }, c("111827")), "left"); break;
      case "C": cell.s = style(rowBg, c("374151"), "left"); break;
      case "D": {
        const [bg, fg] = STATUS_COLORS[statusKind(lead.websiteStatus)];
        cell.s = style(bg, Object.assign({ bold: true }, c(fg)));
        break;
      }
      case "E": {
        const url = safeHttpUrl(lead.websiteUrl);
        if (url !== "-") {
          cell.s = style(rowBg, Object.assign({ underline: true }, c("0066CC")), "left");
          cell.l = { Target: url, Tooltip: "Buka Website Resmi" };
        } else {
          cell.v = SEARCH_LABEL;
          cell.s = style(rowBg, Object.assign({ sz: 9.5, underline: true }, c("0284C7")), "left");
          cell.l = { Target: googleSearchUrl(lead), Tooltip: "Deep Search: Lacak website resmi di Google Search" };
        }
        break;
      }
      case "F": {
        const url = safeHttpUrl(lead.socialUrl);
        if (url !== "-") {
          cell.s = style(rowBg, Object.assign({ underline: true }, c("B45309")), "left");
          cell.l = { Target: url, Tooltip: "Buka Profil Media Sosial" };
        } else {
          cell.v = "-";
          cell.s = style(rowBg, c("8A8886"));
        }
        break;
      }
      case "G": {
        const hasEmail = lead.email && lead.email !== "-";
        cell.s = style(rowBg, Object.assign({ name: "Consolas", sz: 9.5, underline: !!hasEmail }, c(hasEmail ? "0F766E" : "8A8886")), hasEmail ? "left" : "center");
        if (hasEmail) cell.l = { Target: "mailto:" + lead.email, Tooltip: "Kirim Email ke " + lead.email };
        break;
      }
      case "H": {
        const hasTech = lead.techStack && lead.techStack !== "-";
        cell.s = style(hasTech ? "F0FDF4" : rowBg, Object.assign({ sz: 9.5, bold: !!hasTech }, c(hasTech ? "15803D" : "8A8886")));
        break;
      }
      case "I": cell.s = style(rowBg, Object.assign({ name: "Consolas" }, c("111827"))); break;
      case "J": cell.s = style(rowBg, Object.assign({ sz: 9.5 }, c("4B5563"))); break;
      case "K": {
        const url = safeHttpUrl(lead.waUrl);
        const hasWa = url !== "-";
        cell.s = style(hasWa ? "E8F5E9" : rowBg, Object.assign({ bold: hasWa, underline: hasWa }, c(hasWa ? "0D652D" : "8A8886")));
        if (hasWa) cell.l = { Target: url, Tooltip: "Buka Chat WhatsApp" };
        break;
      }
      case "L": cell.s = style(rowBg, c("374151"), "left"); break;
      case "M": cell.s = style("FFFBEB", Object.assign({ bold: true }, c("B45309"))); break;
      case "N": cell.s = style(rowBg, c("4B5563")); break;
      case "O": {
        const [bg, fg] = OUTREACH_COLORS[lead.outreachStatus] || ["F3F4F6", "4B5563"];
        cell.s = style(bg, Object.assign({ sz: 9.5, bold: true }, c(fg)));
        break;
      }
      case "P": {
        const url = safeHttpUrl(lead.mapsUrl);
        cell.s = style(rowBg, Object.assign({ underline: true }, c("0066CC")));
        if (url !== "-") cell.l = { Target: url, Tooltip: "Buka di Google Maps" };
        break;
      }
      case "Q": cell.s = style(rowBg, Object.assign({ sz: 9.5 }, c("6B7280"))); break;
      case "R": cell.s = Object.assign(style(rowBg, c("374151"), "left"), { alignment: { vertical: "center", horizontal: "left", wrapText: true } }); break;
    }
  }

  /**
   * Builds the styled 18-column workbook. `XLSX` is passed in (global in the browser).
   */
  function buildWorkbook(XLSX, leads, sheetName) {
    const list = leads || [];
    const worksheet = XLSX.utils.aoa_to_sheet([COLUMNS].concat(list.map(leadToRow)));

    worksheet["!cols"] = COL_WIDTHS.map((wch) => ({ wch }));
    worksheet["!rows"] = [{ hpx: 28 }].concat(list.map(() => ({ hpx: 21 })));
    worksheet["!dataValidation"] = [{
      sqref: "O2:O" + Math.max(200, list.length + 50),
      type: "list",
      allowBlank: true,
      formula1: '"' + OUTREACH_STATUSES.join(",") + '"'
    }];

    COL_LETTERS.forEach((col) => {
      if (worksheet[col + "1"]) worksheet[col + "1"].s = HEADER_STYLE;
    });

    list.forEach((lead, i) => {
      const rowIdx = i + 2;
      const rowBg = i % 2 === 0 ? "FFFFFF" : "FBFBFA"; // zebra striping
      COL_LETTERS.forEach((col) => {
        const cell = worksheet[col + rowIdx];
        if (cell) decorateCell(cell, col, lead, rowBg);
      });
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "PetaKlien");
    return workbook;
  }

  function exportFilename(prefix, ext, keyword) {
    const dateStr = new Date().toISOString().slice(0, 10);
    return [prefix, keyword, dateStr].filter(Boolean).join("_") + "." + ext;
  }

  /**
   * Triggers a browser download of text content.
   */
  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCSV(leads, filename) {
    downloadText(toCSV(leads), filename, "text/csv;charset=utf-8;");
  }

  function downloadXLSX(XLSX, leads, filename) {
    XLSX.writeFile(buildWorkbook(XLSX, leads), filename);
  }

  const exporter = {
    COL_LETTERS,
    leadToRow,
    escapeCSV,
    toCSV,
    toTSV,
    buildWorkbook,
    googleSearchUrl,
    exportFilename,
    downloadText,
    downloadCSV,
    downloadXLSX
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exporter;
  }
  if (typeof root !== "undefined" && root) {
    root.PetaKlienExporter = exporter;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
