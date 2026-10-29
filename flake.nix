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
        nodejs_24
        pnpm
        watchman

        jdk17_headless

        gnumake
        gcc
        pkg-config

        zlib
        # glibc is removed here
        ncurses
        freetype
        fontconfig
      ];

      profile = ''
        export ANDROID_HOME="$HOME/Android/Sdk"
        export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
        export JAVA_HOME="${pkgs.jdk17_headless}/lib/openjdk"
        export _JAVA_OPTIONS="-Djava.awt.headless=true"
        export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
      '';

      runScript = "bash";
    };
  in {
    packages.${system}.default = fhs;
  };
}