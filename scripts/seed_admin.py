"""Production seed: create an admin user only (no demo products / fake dealers).

Usage in prod:
    sh scripts/prod.sh exec api python scripts/seed_admin.py you@idealx.in

It asks for the password (12+ characters) so it never lands in shell history, and prints the
TOTP secret to add to an authenticator app. ADMIN_EMAIL / ADMIN_PASSWORD env vars also work.
"""
from __future__ import annotations

import os
import secrets
import sys

import bcrypt
import pyotp

# Works from the repo (scripts/ next to apps/api) and inside the API image (/app/scripts).
_here = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(_here, "..", "apps", "api"), os.path.join(_here, "..")):
    if os.path.isdir(os.path.join(_p, "app")):
        sys.path.insert(0, _p)
        break

from app.db.session import SessionLocal  # noqa: E402
from app.db.models import StaffProfile, User  # noqa: E402


def main():
    email = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD")
    if email and not password and sys.stdin.isatty():
        import getpass

        password = getpass.getpass("Admin password (12+ characters): ")
        if password != getpass.getpass("Again: "):
            print("Passwords do not match.")
            sys.exit(1)
    if not email or not password:
        print("Usage: python scripts/seed_admin.py <email>   (or set ADMIN_EMAIL and ADMIN_PASSWORD)")
        sys.exit(1)
    if len(password) < 12:
        print("Use at least 12 characters.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"User {email} already exists.")
            return

        totp_secret = pyotp.random_base32()
        u = User(
            email=email,
            user_type="staff",
            password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            is_active=True,
        )
        db.add(u)
        db.flush()
        staff = StaffProfile(
            user_id=u.id,
            full_name="Production Admin",
            role="super_admin",
            totp_secret=totp_secret,
            totp_enabled=True,
        )
        db.add(staff)
        db.commit()

        uri = pyotp.totp.TOTP(totp_secret).provisioning_uri(
            name=email, issuer_name=os.environ.get("ADMIN_TOTP_ISSUER", "IDEALX")
        )
        print(f"✓ Admin user created: {email}")
        print(f"TOTP secret: {totp_secret}")
        print(f"Add to Google Authenticator using: {uri}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
