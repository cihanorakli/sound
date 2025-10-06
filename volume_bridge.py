#!/usr/bin/env python3
import http.server
import socketserver
import urllib.parse as urlparse
import platform
import subprocess
from typing import Tuple


class VolumeController:
    def __init__(self):
        self.os = platform.system()
        self._win_endpoint = None
        if self.os == "Windows":
            try:
                from ctypes import POINTER, cast
                from comtypes import CLSCTX_ALL  # type: ignore
                from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume  # type: ignore

                devices = AudioUtilities.GetSpeakers()
                interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
                self._win_endpoint = cast(interface, POINTER(IAudioEndpointVolume))
            except Exception:
                self._win_endpoint = None

    def set_volume(self, percent: int) -> bool:
        p = max(0, min(100, int(percent)))
        if self.os == "Darwin":
            try:
                subprocess.run(["osascript", "-e", f"set volume output volume {p}"], check=True)
                return True
            except Exception:
                return False
        elif self.os == "Linux":
            try:
                subprocess.run(["amixer", "-D", "pulse", "sset", "Master", f"{p}%"], check=True)
                return True
            except Exception:
                return False
        elif self.os == "Windows":
            if self._win_endpoint is not None:
                try:
                    self._win_endpoint.SetMasterVolumeLevelScalar(p / 100.0, None)
                    return True
                except Exception:
                    return False
            return False
        return False


volctl = VolumeController()


def _send_headers(handler: http.server.BaseHTTPRequestHandler, code: int = 200, content_type: str = "text/plain"):
    handler.send_response(code)
    handler.send_header("Content-Type", content_type)
    # CORS
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "*")
    handler.end_headers()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format: str, *args):
        return  # sessiz

    def do_OPTIONS(self):
        _send_headers(self, 204)

    def do_GET(self):
        parsed = urlparse.urlparse(self.path)
        if parsed.path == "/ping":
            _send_headers(self, 200)
            self.wfile.write(b"ok")
            return
        _send_headers(self, 404)
        self.wfile.write(b"not found")

    def do_POST(self):
        parsed = urlparse.urlparse(self.path)
        if parsed.path == "/set-volume":
            qs = urlparse.parse_qs(parsed.query)
            p = qs.get("p", [None])[0]
            try:
                p_int = int(p) if p is not None else None
            except Exception:
                p_int = None
            if p_int is None:
                _send_headers(self, 400)
                self.wfile.write(b"bad param")
                return
            ok = volctl.set_volume(p_int)
            if ok:
                _send_headers(self, 200)
                self.wfile.write(b"ok")
            else:
                _send_headers(self, 500)
                self.wfile.write(b"failed")
            return

        _send_headers(self, 404)
        self.wfile.write(b"not found")


def main():
    PORT = 52789
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Volume bridge listening on http://127.0.0.1:{PORT}")
        print("Endpoints: GET /ping, POST /set-volume?p=0..100")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()


if __name__ == "__main__":
    main()

