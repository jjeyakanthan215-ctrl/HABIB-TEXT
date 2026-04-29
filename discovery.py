import logging
import socket

logger = logging.getLogger(__name__)


class MDNSService:
    """
    mDNS/Zeroconf local network discovery.
    On cloud environments (Render, Railway, Heroku, etc.) this is a
    safe no-op stub — mDNS only works on local LANs.
    """

    def __init__(self, port, name="P2PSMS"):
        self.port = port
        self.name = name
        self._enabled = False
        self.ip = self._get_local_ip()    # always safe to call
        self.service_info = None

        try:
            from zeroconf import ServiceInfo, Zeroconf
            import uuid

            self._zeroconf = Zeroconf()
            self._uuid = uuid
            self._socket = socket
            self._ServiceInfo = ServiceInfo
            self._enabled = True
        except Exception as e:
            logger.warning(f"mDNS disabled (cloud/unsupported environment): {e}")

    def _get_local_ip(self) -> str:
        """Best-effort local IP detection. Falls back to 127.0.0.1."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
        except Exception:
            return '127.0.0.1'
        finally:
            try:
                s.close()
            except Exception:
                pass

    def start(self):
        if not self._enabled:
            return
        try:
            import uuid as _uuid
            desc = {'path': '/'}
            instance_name = f"{self.name}_{str(_uuid.uuid4())[:8]}._http._tcp.local."
            self.service_info = self._ServiceInfo(
                "_http._tcp.local.",
                instance_name,
                addresses=[socket.inet_aton(self.ip)],
                port=self.port,
                properties=desc,
                server=f"{self.name}.local."
            )
            self._zeroconf.register_service(self.service_info)
            logger.info(f"mDNS registered: {instance_name} at {self.ip}:{self.port}")
        except Exception as e:
            logger.error(f"mDNS registration failed: {e}")

    def stop(self):
        if not self._enabled:
            return
        try:
            if self.service_info:
                self._zeroconf.unregister_service(self.service_info)
            self._zeroconf.close()
        except Exception:
            pass
        logger.info("mDNS service stopped.")
