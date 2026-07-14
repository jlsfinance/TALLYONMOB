# TallyLink Safety Rules
# These rules MUST be followed in ALL code changes to prevent crashes

## TALLY ERP SAFETY RULES (CRITICAL - NEVER VIOLATE)

### 1. Request Safety
- **NEVER** send XML requests larger than 2MB to Tally
- **ALWAYS** maintain minimum 200ms cooldown between Tally requests
- **NEVER** fetch more than 5000 records in a single Tally request
- **ALWAYS** use batch processing for large data (batch size = 100 vouchers)
- **NEVER** run parallel/concurrent requests to Tally (it's single-threaded)

### 2. Circuit Breaker
- After 5 consecutive Tally failures, STOP sending requests for 60 seconds
- Log all circuit breaker events for debugging
- Auto-reset after cooldown period

### 3. Response Safety
- **NEVER** process Tally XML responses larger than 50MB
- **ALWAYS** sanitize XML responses (remove invalid characters)
- **ALWAYS** use try-catch around XML parsing
- **NEVER** let a parsing error crash the app

### 4. Memory Protection
- **NEVER** load entire Tally response into memory without size check
- **ALWAYS** dispose HttpClient responses properly
- **ALWAYS** use `using` statements for streams/readers

### 5. Date Handling
- **ALWAYS** use TryParse for date fields (never throw on invalid dates)
- **ALWAYS** provide fallback date (DateTime.Now) if parsing fails
- **ALWAYS** send EFFECTIVEDATE alongside DATE in Tally XML

### 6. Voucher Push Safety (Web → Tally)
- **ALWAYS** validate all required fields before generating XML
- **ALWAYS** check stock_item_name, stock_item, AND name fields (web/mobile may use different names)
- **ALWAYS** skip empty/invalid items instead of crashing
- **ALWAYS** log the generated XML for debugging
- **NEVER** push a voucher without a valid party name and date

## APP CRASH PREVENTION RULES

### 7. Exception Handling
- **ALWAYS** handle AppDomain.UnhandledException
- **ALWAYS** handle DispatcherUnhandledException
- **ALWAYS** handle TaskScheduler.UnobservedTaskException
- **NEVER** let a background task exception crash the app
- **ALWAYS** throttle error dialogs (max 2 in 2 seconds)

### 8. Network Safety
- **ALWAYS** use CancellationTokenSource with timeout for all HTTP requests
- **ALWAYS** disable proxy on HttpClient (prevents WSANO_DATA errors)
- **NEVER** wait more than 10 minutes for a single request

### 9. Installer Rules
- **ALWAYS** increment version before building
- **ALWAYS** use Inno Setup for Windows installer
- **ALWAYS** include: License acceptance → Path selection → Desktop shortcut → Start Menu entry
- **ALWAYS** stop running TallyLink before updating exe
- **ALWAYS** publish to /tallysyncapp folder
