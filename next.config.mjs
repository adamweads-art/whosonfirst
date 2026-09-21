/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  experimental: {
    // Card photos travel through a server action. They get shrunk on the phone
    // before upload, but the default 1 MB limit leaves no margin for a large
    // one, so allow a little headroom.
    serverActions: { bodySizeLimit: '4mb' },
  },
};
