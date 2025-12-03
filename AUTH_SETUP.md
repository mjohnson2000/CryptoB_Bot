# Authentication Setup Guide

The admin section is now protected with JWT-based authentication. Follow these steps to set up your credentials.

## Environment Variables

Add the following variables to your `.env` file:

```env
# Admin Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<your-bcrypt-hash>
JWT_SECRET=<your-secret-key>
JWT_EXPIRES_IN=24h
```

## Generating a Password Hash

To generate a bcrypt hash for your password, you can use Node.js:

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10).then(hash => console.log(hash));"
```

Or create a simple script:

```javascript
const bcrypt = require('bcryptjs');
const password = 'your-secure-password';
bcrypt.hash(password, 10).then(hash => {
  console.log('Password hash:', hash);
  console.log('Add this to your .env file as ADMIN_PASSWORD_HASH');
});
```

## Default Credentials (Development Only)

If `ADMIN_PASSWORD_HASH` is not set in `.env`, the system will use a default password:
- **Username:** `admin`
- **Password:** `admin`

⚠️ **WARNING:** This is for development only. Always set `ADMIN_PASSWORD_HASH` in production!

## JWT Secret

The `JWT_SECRET` should be a long, random string. Generate one using:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Token Expiration

The `JWT_EXPIRES_IN` can be:
- A string like `"24h"`, `"7d"`, `"30m"` (using ms format)
- A number in seconds

Default is `24h` (24 hours).

## Security Best Practices

1. **Never commit `.env` file** to version control
2. **Use strong passwords** (minimum 12 characters, mix of letters, numbers, symbols)
3. **Use a unique JWT_SECRET** for each environment
4. **Set shorter expiration times** in production (e.g., `"1h"` or `"30m"`)
5. **Use HTTPS** in production to protect tokens in transit

## Login Flow

1. User navigates to `/admin`
2. If not authenticated, redirected to login page
3. User enters username and password
4. Server validates credentials and returns JWT token
5. Token is stored in localStorage
6. All subsequent API requests include token in Authorization header
7. Token is verified on each protected route

## Logout

Users can logout by clicking the "Logout" button in the menu bar. This clears the token from localStorage.

