import random
import string
import qrcode
import io
import base64

def generate_pin(length=4):
    """Generate a random numeric PIN."""
    return ''.join(random.choices(string.digits, k=length))

def generate_qr_base64(data: str) -> str:
    """Generate a QR code and return it as a base64 encoded string."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    
    return base64.b64encode(img_bytes.read()).decode('utf-8')
