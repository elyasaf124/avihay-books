import requests
import sys

def send_notification(message="המשימה הסתיימה בהצלחה!"):
    # החלף את 'elyasaf_cursor_alerts' בשם שבחרת באפליקציה
    topic = "elyasaf_cursor_alerts"
    
    try:
        response = requests.post(f"https://ntfy.sh/{topic}",
                                 data=message.encode('utf-8'),
                                 headers={
                                     "Title": "Cursor Update",
                                     "Priority": "high"
                                 })
        if response.status_code == 200:
            print("Notification sent!")
        else:
            print(f"Failed to send: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # מאפשר להעביר הודעה מותאמת אישית דרך הטרמינל
    msg = sys.argv[1] if len(sys.argv) > 1 else "המשימה ב-Cursor הסתיימה!"
    send_notification(msg)