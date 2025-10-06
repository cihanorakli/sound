#!/usr/bin/env python3
import sys
import time
import math
import platform
import subprocess

try:
    import cv2 as cv
    import numpy as np
    import mediapipe as mp
except Exception as e:
    print("Gerekli paketler eksik: opencv-python, mediapipe, numpy")
    print("Kurulum: pip install opencv-python mediapipe numpy")
    raise


class VolumeController:
    def __init__(self):
        self.os = platform.system()
        self._win_endpoint = None
        if self.os == "Windows":
            try:
                # Optional Windows absolute volume control via pycaw
                from ctypes import POINTER, cast
                from comtypes import CLSCTX_ALL  # type: ignore
                from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume  # type: ignore

                devices = AudioUtilities.GetSpeakers()
                interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
                self._win_endpoint = cast(interface, POINTER(IAudioEndpointVolume))
                self._win_min, self._win_max, _ = self._win_endpoint.GetVolumeRange()
            except Exception:
                # pycaw yoksa relative kontrol önerilecek
                self._win_endpoint = None

    def set_volume(self, percent: float) -> bool:
        p = max(0, min(100, int(percent)))
        if self.os == "Darwin":
            try:
                # macOS: AppleScript ile sistem sesini 0-100 arası ayarla
                subprocess.run([
                    "osascript", "-e", f"set volume output volume {p}"
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
            except Exception:
                return False
        elif self.os == "Linux":
            # Linux: PulseAudio/ALSA için amixer dene
            try:
                subprocess.run([
                    "amixer", "-D", "pulse", "sset", "Master", f"{p}%"
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
            except Exception:
                # Bazı dağıtımlarda farklı komutlar gerekebilir
                return False
        elif self.os == "Windows":
            # Windows: pycaw varsa mutlak, yoksa başarısız döner (kılavuz mesajı gösterilir)
            if self._win_endpoint is not None:
                try:
                    # pycaw mutlak seviye 0.0-1.0 ve dB aralığına map ile ayarlanır
                    # Basit yol: 0-100 -> 0.0-1.0
                    linear = p / 100.0
                    # SetMasterVolumeLevelScalar mutlak %
                    self._win_endpoint.SetMasterVolumeLevelScalar(linear, None)
                    return True
                except Exception:
                    return False
            return False
        else:
            return False


def main():
    # Webcam aç
    cap = cv.VideoCapture(0)
    if not cap.isOpened():
        print("Kamera açılamadı. Doğru kamerayı seçmek için VideoCapture(1) deneyin.")
        sys.exit(1)

    # Elde mesafe -> ses aralığı kalibrasyonu (piksel)
    # İstersen değiştir: yakın (min), uzak (max)
    min_dist = 20.0
    max_dist = 220.0

    # EMA ile yumuşatma
    smooth_alpha = 0.35
    smooth_vol = None

    vol = 0
    last_set = 0.0
    set_interval = 0.10  # en fazla 10 Hz güncelle

    volctl = VolumeController()

    mp_hands = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils
    mp_styles = mp.solutions.drawing_styles

    # Mediapipe Hands başlat
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    )

    print("\nKontroller:\n  q: Çıkış\n  c: Mevcut mesafeyi MIN olarak kaydet\n  v: Mevcut mesafeyi MAX olarak kaydet\n")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("Kare okunamadı.")
            break

        h, w = frame.shape[:2]
        # BGR -> RGB
        rgb = cv.cvtColor(frame, cv.COLOR_BGR2RGB)
        result = hands.process(rgb)

        pinch_dist = None
        if result.multi_hand_landmarks:
            hand_landmarks = result.multi_hand_landmarks[0]

            # Landmarkları çiz
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                mp_styles.get_default_hand_landmarks_style(),
                mp_styles.get_default_hand_connections_style(),
            )

            # Başparmak ucu (4), işaret parmağı ucu (8)
            lm = hand_landmarks.landmark
            x4, y4 = int(lm[4].x * w), int(lm[4].y * h)
            x8, y8 = int(lm[8].x * w), int(lm[8].y * h)

            pinch_dist = math.hypot(x8 - x4, y8 - y4)

            cv.circle(frame, (x4, y4), 8, (0, 255, 0), -1)
            cv.circle(frame, (x8, y8), 8, (0, 255, 0), -1)
            cv.line(frame, (x4, y4), (x8, y8), (0, 200, 0), 2)

        if pinch_dist is not None:
            # Mesafeyi 0-100 arası sese map et
            d = float(pinch_dist)
            d = max(min_dist, min(max_dist, d))
            new_vol = np.interp(d, [min_dist, max_dist], [0, 100])

            if smooth_vol is None:
                smooth_vol = new_vol
            else:
                smooth_vol = smooth_alpha * new_vol + (1 - smooth_alpha) * smooth_vol

            vol = int(round(smooth_vol))

            # Zaman kontrollü sistem sesi ayarı
            now = time.time()
            if now - last_set > set_interval:
                ok = volctl.set_volume(vol)
                last_set = now
                if not ok and platform.system() == "Windows":
                    cv.putText(
                        frame,
                        "Windows icin: pip install pycaw comtypes",
                        (20, 30),
                        cv.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0, 0, 255),
                        2,
                        cv.LINE_AA,
                    )

        # Ses çubuğu çiz
        bar_x1, bar_y1 = 30, 80
        bar_x2, bar_y2 = 60, 380
        cv.rectangle(frame, (bar_x1, bar_y1), (bar_x2, bar_y2), (200, 200, 200), 2)
        filled_y = int(np.interp(vol, [0, 100], [bar_y2, bar_y1]))
        cv.rectangle(frame, (bar_x1 + 2, filled_y), (bar_x2 - 2, bar_y2 - 2), (0, 200, 0), -1)
        cv.putText(frame, f"Vol: {vol}%", (20, 410), cv.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Bilgi yazıları
        cv.putText(frame, "Basparmak-Index mesafesi -> Ses", (100, 30), cv.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv.putText(frame, "c: MIN, v: MAX, q: Cikis", (100, 60), cv.FONT_HERSHEY_SIMPLEX, 0.6, (180, 180, 180), 1)
        if pinch_dist is not None:
            cv.putText(frame, f"dist: {pinch_dist:.1f}", (100, 85), cv.FONT_HERSHEY_SIMPLEX, 0.6, (180, 180, 180), 1)

        cv.imshow("Hand Volume Control", frame)
        key = cv.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('c') and pinch_dist is not None:
            min_dist = float(pinch_dist)
        elif key == ord('v') and pinch_dist is not None:
            max_dist = float(pinch_dist)

    cap.release()
    cv.destroyAllWindows()


if __name__ == "__main__":
    main()

