# Bakbokim – WhatsApp Order Sender

A clean, browser-based tool for sending personalized WhatsApp messages from an Excel order sheet.

## How it works

1. **Upload** an Excel file (`.xlsx` / `.xls`) with your order data
2. The app generates a personalized WhatsApp message for each row
3. **Preview** the message before sending
4. **Send** with one click — or bulk-send multiple orders at once

## Excel column structure

| Column | Content |
|--------|---------|
| A | Order Number |
| B | Customer Name |
| C | Any (ignored) |
| D | Phone Number |
| E+ | Order Items (quantity per column) |

Phone numbers are auto-formatted to Israeli format (`+972`).

## Features

- 📤 Drag & drop Excel upload
- 👁️ Message preview (WhatsApp-style bubble)
- ✅ Sent / pending status tracking (saved in browser)
- 🔁 Bulk send with configurable delay
- ⚙️ Customizable sender name, city, address, calendar link & message template
- 🌙 Dark / light mode
- 🇮🇱 Bilingual messages (Hebrew + English)
- 📱 RTL-aware layout

## Setup

No installation needed — just open `index.html` in any modern browser.

```
open index.html
```

## Tech

- Vanilla HTML / CSS / JavaScript — zero dependencies, zero build step
- [SheetJS](https://sheetjs.com/) (CDN) for Excel parsing
- All data stays in your browser (localStorage)

## Sample file

A ready-to-use `sample_orders.xlsx` is included for testing.
