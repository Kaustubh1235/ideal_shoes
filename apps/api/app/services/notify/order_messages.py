"""Who to tell about an order, and the order-confirmation email body."""
from __future__ import annotations

from html import escape

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Address, Order


def order_contact(db: Session, order: Order) -> tuple[str, str | None, str | None]:
    """(name, phone, email) for an order: the account first, else what was typed at checkout.
    Guests have no account, so their delivery address is the only way to reach them."""
    ship = db.get(Address, order.shipping_address_id) if order.shipping_address_id else None
    user = order.user
    name = (
        (user.customer.name if user and user.customer and user.customer.name not in (None, "", "Customer") else None)
        or (ship.full_name if ship else None)
        or "there"
    )
    phone = (user.phone if user and user.phone else None) or (ship.phone if ship else None)
    email = order.contact_email or (user.email if user else None)
    return name, phone, email


def order_confirmed_email(order: Order, name: str) -> tuple[str, str]:
    s = get_settings()
    site = s.public_site_url
    subject = f"IDEALX order {order.order_no} confirmed"
    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0'>{escape(i.name)}</td>"
        f"<td style='padding:4px 0;text-align:right'>{i.quantity} × ₹{i.unit_price / 100:,.2f}</td></tr>"
        for i in order.items
    )
    link = f"{site}/checkout/{order.id}/pay" if site else ""
    html = f"""<div style="font-family:Georgia,serif;color:#1f1a17;max-width:560px">
<h2 style="font-weight:600">Thank you, {escape(name)}.</h2>
<p>We have received your payment for order <b>{escape(order.order_no)}</b>.
We will write again when it ships. Your GST invoice can be downloaded from the order page.</p>
<table style="border-collapse:collapse;font-size:15px">{rows}</table>
<p style="font-size:17px"><b>Total paid: ₹{order.grand_total / 100:,.2f}</b> (incl. GST)</p>
{f'<p><a href="{escape(link)}">View your order</a></p>' if link else ''}
<p style="color:#6b625b;font-size:13px">{escape(s.seller_trade_name)} · {escape(s.seller_legal_name)}, Agra.
Questions: reply to this mail{f' or call {escape(s.seller_phone)}' if s.seller_phone else ''}.</p>
</div>"""
    return subject, html
