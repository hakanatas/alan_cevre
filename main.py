# -*- coding: utf-8 -*-
import os
import sys
import cv2
import mediapipe as mp
import numpy as np
import threading
import time
import random
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# --- DİL VE SİSTEM AYARLARI ---
os.environ['LC_ALL'] = 'C'

# --- EKRAN AYARLARI (720p HD - 16:9 Geniş) ---
CAM_WIDTH = 1280
CAM_HEIGHT = 720
FPS = 30
SCREEN_W = 1280 
SCREEN_H = 720 
PIXELS_PER_UNIT = 100 

# --- RENK PALETİ ---
C_NEON_GREEN = (50, 255, 50)     # Başarı
C_NEON_BLUE = (255, 200, 0)      # Hedefler
C_WARNING = (0, 165, 255)        # Dikkat çekici
C_WHITE = (230, 230, 230)        # Kırık beyaz
C_BLACK_BG = (20, 20, 20)        # Koyu gri arka plan
C_GRID = (200, 200, 200)

FONT = cv2.FONT_HERSHEY_TRIPLEX # Kalın Font

# --- GÖREV BANKASI ---
QUESTIONS_SOURCE = [
    {"area": 15, "perimeter": 16}, {"area": 12, "perimeter": 14},
    {"area": 16, "perimeter": 16}, {"area": 8,  "perimeter": 12},
    {"area": 20, "perimeter": 18}, {"area": 9,  "perimeter": 12},
    {"area": 10, "perimeter": 14}, {"area": 6,  "perimeter": 10},
]
QUESTIONS = QUESTIONS_SOURCE.copy()
random.shuffle(QUESTIONS)

# --- KAMERA SINIFI (MacOS Uyumlu) ---
class CameraStream:
    def __init__(self):
        self.frame = None
        self.running = False
        self.cap = cv2.VideoCapture(0)
        
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAM_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAM_HEIGHT)
        self.cap.set(cv2.CAP_PROP_FPS, FPS) 

        if not self.cap.isOpened():
            print("HATA: Kamera açılamadı.")
            sys.exit(1)

        self.running = True
        self.thread = threading.Thread(target=self.update, args=())
        self.thread.daemon = True
        self.thread.start()
        time.sleep(1)

    def update(self):
        while self.running:
            ret, frame = self.cap.read()
            if ret:
                self.frame = frame
            else:
                pass 

    def read(self):
        return self.frame

    def stop(self):
        self.running = False
        if self.cap.isOpened():
            self.cap.release()

# --- YENİ "SLIM-FIT" TASARIM ---
def draw_ui(img, current_q, q_index, total_q, current_area, current_perim, is_success):
    panel_h = 70
    cv2.rectangle(img, (0, 0), (CAM_WIDTH, panel_h), C_BLACK_BG, -1)
    border_col = C_NEON_GREEN if is_success else C_NEON_BLUE
    cv2.line(img, (0, panel_h), (CAM_WIDTH, panel_h), border_col, 2)

    if is_success:
        msg = "HARIKA! GOREV TAMAM!"
        (mw, mh), _ = cv2.getTextSize(msg, FONT, 1.0, 2)
        cv2.putText(img, msg, ((CAM_WIDTH - mw)//2, 45), FONT, 1.0, C_NEON_GREEN, 2, cv2.LINE_AA)
    else:
        instr = "YONERGE: Iki isaret parmaginla hedeflenen dikdortgeni olustur."
        (iw, ih), _ = cv2.getTextSize(instr, FONT, 0.4, 1)
        cv2.putText(img, instr, ((CAM_WIDTH - iw)//2, 20), FONT, 0.4, (150,150,150), 1, cv2.LINE_AA)

        q_txt = f"GOREV {q_index + 1} / {total_q}"
        cv2.putText(img, q_txt, (20, 55), FONT, 0.6, C_WHITE, 1, cv2.LINE_AA)
        
        t_txt = f"HEDEF > ALAN: {current_q['area']}  |  CEVRE: {current_q['perimeter']}"
        (tw, th), _ = cv2.getTextSize(t_txt, FONT, 0.7, 2)
        cv2.putText(img, t_txt, ((CAM_WIDTH - tw)//2, 55), FONT, 0.7, C_NEON_BLUE, 2, cv2.LINE_AA)

    if not is_success:
        bar_h = 60
        bar_y = CAM_HEIGHT - bar_h
        cv2.rectangle(img, (0, bar_y), (CAM_WIDTH, CAM_HEIGHT), C_BLACK_BG, -1)
        cv2.line(img, (0, bar_y), (CAM_WIDTH, bar_y), C_WARNING, 2)
        
        lbl = "SENIN YAPTIGIN:"
        cv2.putText(img, lbl, (20, bar_y + 35), FONT, 0.5, C_WHITE, 1, cv2.LINE_AA)
        
        col_a = C_NEON_GREEN if current_area == current_q['area'] else C_WHITE
        col_p = C_NEON_GREEN if current_perim == current_q['perimeter'] else C_WHITE
        
        val_a = f"ALAN: {current_area}"
        cv2.putText(img, val_a, (180, bar_y + 35), FONT, 0.7, col_a, 2, cv2.LINE_AA)
        cv2.putText(img, "|", (320, bar_y + 35), FONT, 0.7, (100,100,100), 2, cv2.LINE_AA)
        val_p = f"CEVRE: {current_perim}"
        cv2.putText(img, val_p, (360, bar_y + 35), FONT, 0.7, col_p, 2, cv2.LINE_AA)

        cr_txt = "FTC #24230"
        (cw, ch), _ = cv2.getTextSize(cr_txt, FONT, 0.4, 1)
        cv2.putText(img, cr_txt, (CAM_WIDTH - cw - 20, CAM_HEIGHT - 20), FONT, 0.4, (150,150,150), 1, cv2.LINE_AA)

def main():
    print("--- 5. SINIF MATEMATİK OYUNU (MACOS VERSION) BAŞLADI ---")
    
    # 1. Initialize MediaPipe via Tasks API
    base_options = python.BaseOptions(model_asset_path='hand_landmarker.task')
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        running_mode=vision.RunningMode.VIDEO)
    
    # 2. Main Loop
    with vision.HandLandmarker.create_from_options(options) as landmarker:
        
        cam = CameraStream()
        
        WINDOW_NAME = 'Matematik Oyunu'
        cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(WINDOW_NAME, SCREEN_W, SCREEN_H)
        
        q_index = 0
        success_timer = 0
        is_success = False
        frozen_frame = None 
        start_time_seconds = time.time()
        
        while True:
            # --- DONMUŞ EKRAN ---
            if is_success:
                _ = cam.read()
                if frozen_frame is not None:
                    frozen_resized = cv2.resize(frozen_frame, (SCREEN_W, SCREEN_H))
                    cv2.imshow(WINDOW_NAME, frozen_resized)
                
                if time.time() - success_timer > 3.0:
                    is_success = False
                    frozen_frame = None
                    q_index += 1
                    if q_index >= len(QUESTIONS):
                        random.shuffle(QUESTIONS)
                        q_index = 0
                if cv2.waitKey(1) & 0xFF == ord('q'): break
                continue

            # --- CANLI OYUN ---
            frame = cam.read()
            if frame is None:
                time.sleep(0.01)
                continue
            
            frame = cv2.flip(frame, 1)
            display_frame = frame.copy() 
            
            # MediaPipe tasks requires RGB image
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            
            # Timestamp in ms
            timestamp_ms = int((time.time() - start_time_seconds) * 1000)
            
            results = landmarker.detect_for_video(mp_image, timestamp_ms)
            
            h_img, w_img, _ = frame.shape
            fingers = []
            
            # results.hand_landmarks is a list of lists of normalized landmarks
            if results.hand_landmarks:
                for hand_landmarks in results.hand_landmarks:
                    # Index 8 is Index Finger Tip
                    idx_tip = hand_landmarks[8]
                    cx, cy = int(idx_tip.x * w_img), int(idx_tip.y * h_img)
                    fingers.append((cx, cy))
                    cv2.circle(display_frame, (cx, cy), 8, C_NEON_BLUE, -1)
            
            current_area = 0
            current_perim = 0
            unit_w = 0
            unit_h = 0
            hands_visible = False
            left, top, snapped_r, snapped_b = 0, 0, 0, 0

            if len(fingers) == 2:
                hands_visible = True
                p1, p2 = fingers[0], fingers[1]
                left, right = min(p1[0], p2[0]), max(p1[0], p2[0])
                top, bottom = min(p1[1], p2[1]), max(p1[1], p2[1])
                
                raw_w = right - left
                raw_h = bottom - top
                unit_w = max(1, int(round(raw_w / PIXELS_PER_UNIT)))
                unit_h = max(1, int(round(raw_h / PIXELS_PER_UNIT)))
                
                current_area = unit_w * unit_h
                current_perim = 2 * (unit_w + unit_h)
                
                snapped_r = left + unit_w * PIXELS_PER_UNIT
                snapped_b = top + unit_h * PIXELS_PER_UNIT
                
                cv2.rectangle(display_frame, (left, top), (right, bottom), (80,80,80), 1)
                
                for i in range(unit_w + 1):
                    x = left + i * PIXELS_PER_UNIT
                    cv2.line(display_frame, (x, top), (x, snapped_b), C_WHITE, 1)
                for i in range(unit_h + 1):
                    y = top + i * PIXELS_PER_UNIT
                    cv2.line(display_frame, (left, y), (snapped_r, y), C_WHITE, 1)
                
                cv2.rectangle(display_frame, (left, top), (snapped_r, snapped_b), C_NEON_GREEN, 4)

            current_q = QUESTIONS[q_index]
            
            if (current_area == current_q['area'] and current_perim == current_q['perimeter']):
                is_success = True
                success_timer = time.time()
                
                draw_ui(display_frame, current_q, q_index, len(QUESTIONS), current_area, current_perim, True)
                
                if hands_visible:
                    center_x = left + (snapped_r - left) // 2
                    center_y = top + (snapped_b - top) // 2
                    dim_text = f"{unit_w} x {unit_h}"
                    
                    font_scale = 2.0 
                    thick = 4
                    (text_w, text_h), _ = cv2.getTextSize(dim_text, FONT, font_scale, thick)
                    
                    bg_x1 = center_x - text_w // 2 - 30
                    bg_y1 = center_y - text_h // 2 - 30
                    bg_x2 = center_x + text_w // 2 + 30
                    bg_y2 = center_y + text_h // 2 + 30
                    
                    cv2.rectangle(display_frame, (bg_x1, bg_y1), (bg_x2, bg_y2), C_BLACK_BG, -1)
                    cv2.rectangle(display_frame, (bg_x1, bg_y1), (bg_x2, bg_y2), C_NEON_GREEN, 4)
                    
                    cv2.putText(display_frame, dim_text, (center_x - text_w // 2, center_y + text_h // 2), FONT, font_scale, C_NEON_BLUE, thick)

                frozen_frame = display_frame.copy()
                
            else:
                draw_ui(display_frame, current_q, q_index, len(QUESTIONS), current_area, current_perim, False)
            
            if not is_success:
                final_output = cv2.resize(display_frame, (SCREEN_W, SCREEN_H))
                cv2.imshow(WINDOW_NAME, final_output)
            
            if cv2.waitKey(1) & 0xFF == ord('q'): break

        cam.stop()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
