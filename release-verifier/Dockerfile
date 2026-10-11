FROM eclipse-temurin:17-jre-jammy
ARG ANDROID_TOOLS_VERSION=11076708
RUN apt-get update && apt-get install -y --no-install-recommends python3 curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/android && curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_TOOLS_VERSION}_latest.zip" -o /tmp/tools.zip && unzip -q /tmp/tools.zip -d /opt/android && rm /tmp/tools.zip && yes | /opt/android/cmdline-tools/bin/sdkmanager --sdk_root=/opt/android --licenses >/dev/null && /opt/android/cmdline-tools/bin/sdkmanager --sdk_root=/opt/android 'build-tools;36.0.0'
RUN useradd -m verifier
WORKDIR /app
COPY verifier.py /app/verifier.py
USER verifier
EXPOSE 8080
CMD ["python3", "/app/verifier.py"]
