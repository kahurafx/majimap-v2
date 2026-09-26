{
  description = "Turborepo React Native Android Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }: let
    system = "x86_64-linux";
    pkgs = import nixpkgs {
      inherit system;
      config.allowUnfree = true;
    };

    fhs = pkgs.buildFHSEnv {
      name = "turbo-rn-workspace";
      targetPkgs = p: with p; [
        # JS Ecosystem (Latest LTS)
        nodejs_24
        pnpm
        watchman

        # Java Environment (Must be JDK 17 for React Native)
        jdk17

        # Native compilation tools for RN C++ modules
        gnumake
        gcc
        pkg-config

        # Standard Linux libraries required by the unpatched Android SDK
        zlib
        glibc
        ncurses
        freetype
      ];

      # Bind environment variables strictly inside the shell
      profile = ''
        export ANDROID_HOME="$HOME/Android/Sdk"
        export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
        export JAVA_HOME="${pkgs.jdk17}/lib/openjdk"

        # Expose adb and gradle to your PATH
        export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
      '';

      runScript = "bash";
    };
  in {
    packages.${system}.default = fhs;
  };
}