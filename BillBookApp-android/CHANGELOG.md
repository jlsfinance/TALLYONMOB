# Changelog

## Version 1.9.9 (2026-01-15)

### New Feature: Smart WhatsApp Share & AI Translation
We have upgraded the Invoice Sharing experience with powerful new capabilities.

#### Features Added

**1. Direct WhatsApp Share Button**
- Added a dedicated WhatsApp Icon in the Invoice Header (next to Download).
- Opens the Share Modal instantly.

**2. PDF Attachment**
- **New Toggle:** Attach PDF
- When enabled, the app shares the Invoice PDF File along with the message.
- Uses System Share Sheet (Android Native), allowing you to select WhatsApp (or any other app) and pick the contact manually.
- *Note:* Direct number sharing is not possible when attaching files due to WhatsApp limitations.

**3. AI Translation (Hinglish)**
- **New Toggle:** Hinglish AI (Visible only if Gemini API Key is set).
- Uses Google Gemini to translate the invoice details into natural Hinglish (Hindi + English mix).
- Perfect for communicating with local customers.
- Keeps numbers and formatting intact.

**4. Save Paper Invoice Template**
- New eco-friendly, compact invoice template.
- QR Code in header (top-left), Invoice # moved to right.
- Reduced vertical spacing for paper savings.

#### How to Use
1. Open an Invoice.
2. Click the Green WhatsApp Button in the header.
3. In the modal:
   - Toggle **Attach PDF** if you want to send the file.
   - Toggle **Hinglish AI** to translate the message.
4. Click **Share/Send**.
   - If PDF is ON: Select WhatsApp → Select Contact.
   - If PDF is OFF: WhatsApp opens directly to the customer's chat.

#### Technical Details
- Modified `InvoicePdfService` to support file path return.
- Integrated `AIService` with Gemini 3 Flash for translation.
- Updated `InvoiceView` UI with reactive share logic.
- Added `SAVE_PAPER` template to `InvoiceFormat` enum.

---

## Previous Versions
*(Older changelog entries would go here)*
