#!/usr/bin/env python3
"""
Utility script to generate admin password hash.
Usage: python generate_admin_password.py
Then copy the hash to ADMIN_PASSWORD_HASH in your .env file
"""

from passlib.context import CryptContext
import sys

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

if __name__ == "__main__":
    password = input("Enter admin password: ").strip()
    if not password:
        print("Error: Password cannot be empty")
        sys.exit(1)
    
    password_confirm = input("Confirm password: ").strip()
    if password != password_confirm:
        print("Error: Passwords do not match")
        sys.exit(1)
    
    password_hash = pwd_context.hash(password)
    print(f"\nPassword hash:\n{password_hash}\n")
    print("Add this to your .env file:")
    print(f"ADMIN_PASSWORD_HASH={password_hash}")
