FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac
ENV DEBIAN_FRONTEND=noninteractive
ARG LO_VERSION=26.2.6.3
ARG LO_SHA256=fd0e8f8f2408dd2e5b90286e60f3f97cf566ba441cd48cfc5bcc68067303e0bc
# The only fonts are LibreOffice's own and the three below. Noto or DejaVu
# packages would turn the set-difference sign into a divides sign.
RUN apt-get update && apt-get install --yes --no-install-recommends \
    libxinerama1 libdbus-1-3 libcups2 libsm6 libice6 libx11-xcb1 libxrender1 libxext6 libnss3 libglib2.0-0 libcairo2 \
    fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea fontconfig \
    python3 python3-pip ca-certificates curl \
    && curl -fsSL -o /tmp/lo.tar.gz "https://downloadarchive.documentfoundation.org/libreoffice/old/${LO_VERSION}/deb/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_deb.tar.gz" \
    && echo "${LO_SHA256}  /tmp/lo.tar.gz" | sha256sum -c - \
    && mkdir /tmp/lo && tar -xzf /tmp/lo.tar.gz -C /tmp/lo --strip-components=1 \
    && dpkg -i /tmp/lo/DEBS/*.deb && rm -rf /tmp/lo /tmp/lo.tar.gz /var/lib/apt/lists/* \
    && ln -s /opt/libreoffice*/program/soffice /usr/local/bin/soffice
RUN pip3 install --break-system-packages pymupdf==1.28.2 segno==1.6.6
COPY docx_to_pdf.py stamp_qr.py /app/
ENV HOME=/tmp
WORKDIR /work
