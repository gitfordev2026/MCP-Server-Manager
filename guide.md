# Application Security Verification & Testing Guide

This guide outlines standard methodologies for conducting manual security assessments and configuration verification based on established frameworks such as the **OWASP Application Security Verification Standard (ASVS)** and **NIST SP 800-115**.

---

## 1. Security Verification Methodology Overview

A comprehensive security audit evaluates an application's defensive controls across multiple layers:

* **Authentication & Identity Management**: Verifying token structure, password policies, and session lifetimes.
* **Authorization & Access Control**: Testing role boundaries and object-level permissions.
* **Data Protection & Encryption**: Ensuring sensitive data is encrypted in transit and at rest.
* **Input & Output Handling**: Verifying proper parameter validation and output encoding.
* **Security Configuration**: Checking HTTP headers, TLS setup, and CORS policies.

---

## 2. Testing via Browser Developer Tools

Modern browser Developer Tools (F12 or Ctrl+Shift+I) provide essential capabilities for inspecting client-side security controls and network traffic.

### A. Network Panel Inspection
1. **Request & Response Headers**:
   * Inspect response headers for security controls:
     * `Strict-Transport-Security` (HSTS)
     * `Content-Security-Policy` (CSP)
     * `X-Frame-Options` or `frame-ancestors` directive
     * `X-Content-Type-Options: nosniff`
     * `Referrer-Policy`
2. **Authorization Headers**:
   * Verify whether tokens are passed securely in `Authorization: Bearer <token>` headers or via secure HttpOnly cookies.

### B. Application / Storage Panel Inspection
1. **Cookie Security Attributes**:
   * Inspect all set cookies for mandatory flags:
     * `HttpOnly`: Prevents client-side script access to session identifiers.
     * `Secure`: Ensures cookies are only transmitted over encrypted HTTPS channels.
     * `SameSite`: Configured to `Lax` or `Strict` to mitigate cross-site request forgery risks.
2. **Local & Session Storage Audit**:
   * Verify that high-value secrets (e.g., long-lived refresh tokens, private keys) are not stored in unencrypted `localStorage` or `sessionStorage`.

### C. Console & Source Inspection
1. **Console Warnings**:
   * Check for CSP violations, mixed-content warnings, or unhandled promise rejections.
2. **Source Code Review**:
   * Verify that source maps and debug builds are disabled in production environments.

---

## 3. Traffic Inspection & Analysis with Burp Suite

Burp Suite acts as an interception proxy positioned between the browser client and the backend server to inspect and analyze HTTP/HTTPS communications.

### A. Proxy Configuration
1. **Configure Proxy Listener**:
   * In Burp Suite, ensure the proxy listener is active (default: `127.0.0.1:8080`).
2. **Browser Proxy Setup**:
   * Configure your browser or a dedicated proxy extension (e.g., FoxyProxy) to route traffic through `127.0.0.1:8080`.
3. **CA Certificate Installation**:
   * Export the Burp CA Certificate from `http://burp` and import it into the browser's trusted root certificate store to allow decryption and inspection of HTTPS traffic.

### B. Traffic Interception & Modification
1. **HTTP Proxy History**:
   * Navigate through the application to populate the target site map and HTTP history log.
2. **Request Repeater**:
   * Send specific requests to **Burp Repeater** (`Ctrl+R`) to re-issue modified parameter values and analyze server response codes and headers.
3. **Access Control Testing (Dual-Session Inspection)**:
   * Test privilege boundaries by attempting to request endpoints assigned to higher-privilege roles using low-privilege session tokens.

---

## 4. Key Security Verification Checklist

| Category | Verification Item | Expected Secure Behavior |
| :--- | :--- | :--- |
| **Headers** | Content Security Policy | Restricted script sources (`default-src 'self'`) |
| **Transport** | TLS Verification | TLS 1.2+ enforced; invalid certificates rejected |
| **Sessions** | Cookie Flags | `HttpOnly`, `Secure`, and `SameSite=Lax/Strict` enabled |
| **APIs** | Authentication | Validated JWT signature, issuer, and expiration |
| **Access Control** | RBAC Enforcement | Server-side check on all protected API endpoints |
| **Error Handling**| Verbose Stack Traces | Sanitized, generic error messages returned to clients |

---

## 5. References & Standards

* [OWASP ASVS Project](https://owasp.org/www-project-application-security-verification-standard/)
* [OWASP Top 10 Web Application Security Risks](https://owasp.org/www-project-top-ten/)
* [NIST SP 800-115: Technical Guide to Information Security Testing and Assessment](https://csrc.nist.gov/publications/detail/sp/800-115/final)
