import mediapipe as mp
try:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    print("Tasks API import successful")
except ImportError as e:
    print(f"Tasks API import failed: {e}")
except Exception as e:
    print(f"Error: {e}")
