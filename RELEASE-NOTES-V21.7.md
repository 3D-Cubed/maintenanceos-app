# MaintenanceOS V21.7

## QR asset deep-link fix

- QR codes and copied asset links now use hash-based deep links (`#asset/<UUID>`).
- Hash routing is client-side, so links work reliably on the Vercel/custom-domain deployment without depending on server-side query handling or rewrites.
- Existing `?asset=<UUID>` links remain supported by the application.
- Existing `#asset/<UUID>` links remain supported.

No database migration required.
