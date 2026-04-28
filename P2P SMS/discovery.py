import logging

logger = logging.getLogger(__name__)

class MDNSService:
    """
    mDNS/Zeroconf local network discovery.
    On cloud environments (like Render), this is a no-op stub
    since mDNS only works on local networks.
    """

    def __init__(self, port, name="P2PSMS"):
        self.port = port
        self.name = name
        self._enabled = False

        try:
            import socket
            from zeroconf import ServiceInfo, Zeroconf
            import uuid

            self._zeroconf = Zeroconf()
            self._uuid = uuid
            self._socket = socket
            self._ServiceInfo = ServiceInfo
            self._enabled = True
            self.ip = self._get_local_ip()
            self.service_info = None
        except Exception as e:
            logger.warning(f"mDNS disabled (cloud/unsupported environment): {e}")

    def _get_local_ip(self):
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
        except Exception:
            return '127.0.0.1'
        finally:
            s.close()

    def start(self):
        if not self._enabled:
            return
        try:
            desc = {'path': '/'}
            instance_name = f"{self.name}_{str(self._uuid.uuid4())[:8]}._http._tcp.local."
            self.service_info = self._ServiceInfo(
                "_http._tcp.local.",
                instance_name,
                addresses=[self._socket.inet_aton(self.ip)],
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
