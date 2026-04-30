import time
import uuid
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8006"

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False) # Headed to see what happens
        
        # User A (Host)
        context_a = browser.new_context()
        page_a = context_a.new_page()
        user_a = f"test_a_{uuid.uuid4().hex[:4]}"
        
        # User B (Joiner)
        context_b = browser.new_context()
        page_b = context_b.new_page()
        user_b = f"test_b_{uuid.uuid4().hex[:4]}"
        
        space_name = f"Space_{uuid.uuid4().hex[:4]}"
        
        print("--- Registering User A ---")
        page_a.goto(URL)
        page_a.click("#auth-toggle")
        page_a.fill("#auth-username", user_a)
        page_a.fill("#auth-password", "password123")
        page_a.click("#auth-submit-btn")
        page_a.wait_for_timeout(1000)
        page_a.fill("#auth-username", user_a)
        page_a.fill("#auth-password", "password123")
        page_a.click("#auth-submit-btn")
        page_a.wait_for_selector("#dashboard-screen.active", timeout=10000)
        
        print(f"--- Hosting Space: {space_name} ---")
        page_a.fill("#host-space-name", space_name)
        page_a.fill("#host-pin", "1234")
        page_a.click("button:has-text('Start Hosting')")
        page_a.wait_for_selector("text=Your Space is Live")
        
        print("--- Registering User B ---")
        page_b.goto(URL)
        page_b.click("#auth-toggle")
        page_b.fill("#auth-username", user_b)
        page_b.fill("#auth-password", "password123")
        page_b.click("#auth-submit-btn")
        page_b.wait_for_timeout(1000)
        page_b.fill("#auth-username", user_b)
        page_b.fill("#auth-password", "password123")
        page_b.click("#auth-submit-btn")
        page_b.wait_for_selector("#dashboard-screen.active", timeout=10000)
        
        print(f"--- Joining Space: {space_name} ---")
        page_b.click("#tab-join")
        page_b.fill("#join-space-name", space_name)
        page_b.fill("#join-pin", "1234")
        page_b.click("button:has-text('Connect')")
        
        print("--- Validating Chat Room & P2P Connection ---")
        # Both should see each other
        page_a.wait_for_selector(f"text={user_b} joined the room", timeout=5000)
        page_b.wait_for_selector(f"text={user_a} joined the room", timeout=5000)
        
        # Test real-time messaging
        page_b.fill("#message-input", "Hello from User B!")
        page_b.click("#send-btn")
        
        # User A should receive it
        page_a.wait_for_selector("text=Hello from User B!", timeout=5000)
        print("-> Real-time message successfully received!")
        
        print("--- Testing Offline Messaging (Store & Forward) ---")
        # User B drops out
        page_b.close()
        
        # User A waits for disconnect notice
        page_a.wait_for_selector("text=Disconnected")
        
        # User A sends offline message
        page_a.fill("#message-input", "This is an offline message from User A.")
        page_a.click("#send-btn")
        
        # Verify toast
        page_a.wait_for_selector("text=Peer offline. Message stored in server queue.", timeout=5000)
        print("-> Message successfully queued offline!")
        
        # User B logs back in
        page_b = context_b.new_page()
        page_b.goto(URL)
        page_b.fill("#auth-username", user_b)
        page_b.fill("#auth-password", "password123")
        page_b.click("#auth-submit-btn")
        page_b.wait_for_selector("#dashboard-screen.active", timeout=10000)
        page_b.click("#tab-join")
        page_b.fill("#join-space-name", space_name)
        page_b.fill("#join-pin", "1234")
        page_b.click("button:has-text('Connect')")
        
        # User B should see the offline message instantly
        page_b.wait_for_selector("text=This is an offline message from User A.", timeout=5000)
        print("-> Offline message instantly retrieved!")
        
        print("--- Testing Admin Portal ---")
        context_admin = browser.new_context()
        page_admin = context_admin.new_page()
        page_admin.goto(URL)
        
        # Admin uses the normal login form
        page_admin.fill("#auth-username", "ESCTRIX_Admin")
        page_admin.fill("#auth-password", "Esctrix@215")
        page_admin.click("#auth-submit-btn")
        
        # Verify Admin Dashboard
        page_admin.wait_for_selector("text=Admin Dashboard", timeout=5000)
        page_admin.wait_for_selector(f"text={space_name}", timeout=5000)
        print("-> Admin Portal successfully accessed and active room verified!")
        
        print("\n[SUCCESS] All automated E2E tests passed beautifully! The code is flawless.")
        browser.close()

if __name__ == "__main__":
    run_test()
