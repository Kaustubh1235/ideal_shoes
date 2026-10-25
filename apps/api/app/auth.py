"""JWT verification shared with Next.js Auth.js v5. Same AUTH_SECRET, HS256."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()


class AuthUser(BaseModel):
    user_id: str
    user_type: str  # customer | dealer | staff
    role: str | None = None  # staff role if applicable
    dealer_id: str | None = None
    email: str | None = None


def _decode(token: str) -> AuthUser:
    try:
        payload = jwt.decode(
            token,
            settings.auth_secret,
            algorithms=["HS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"verify_aud": False, "verify_iss": False},
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token") from e

    sub = payload.get("sub") or payload.get("userId")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    return AuthUser(
        user_id=str(sub),
        user_type=payload.get("userType", "customer"),
        role=payload.get("role"),
        dealer_id=payload.get("dealerId"),
        email=payload.get("email"),
    )


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    return _decode(authorization.split(" ", 1)[1])


def get_optional_user(authorization: Annotated[str | None, Header()] = None) -> AuthUser | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return _decode(authorization.split(" ", 1)[1])
    except HTTPException:
        return None


def require_staff(user: Annotated[AuthUser, Depends(get_current_user)]) -> AuthUser:
    if user.user_type != "staff":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="staff_only")
    return user


def require_dealer(user: Annotated[AuthUser, Depends(get_current_user)]) -> AuthUser:
    if user.user_type != "dealer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="dealer_only")
    return user


def can_access_order(user: AuthUser, order_user_id) -> bool:
    """Staff and the web server's service token see every order; a customer or dealer only their own."""
    if user.user_type in ("staff", "service"):
        return True
    return order_user_id is not None and str(order_user_id) == user.user_id
