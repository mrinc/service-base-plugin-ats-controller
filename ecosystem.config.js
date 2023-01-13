module.exports = {
  apps: [
    {
      name: "ats_system",
      script: "./node_modules/@bettercorp/service-base/lib/cli.js",
      cwd: "/store/atscontroller",
      instances: 1,
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        BSB_PROFILE: "default",
      },
    },
  ],
};
