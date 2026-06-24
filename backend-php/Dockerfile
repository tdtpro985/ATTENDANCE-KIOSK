FROM php:8.2-apache

# Required PHP extensions per the README: curl, gd, mysqli, openssl, json
# (openssl and json are already compiled into PHP core)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4-openssl-dev \
        libpng-dev \
        libjpeg-dev \
        libfreetype6-dev \
        unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" gd mysqli curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Serve backend-php/public as the document root, not the repo root
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

WORKDIR /var/www/html

# Build context is the backend-php/ folder (see docker-compose.yml)
COPY . /var/www/html

# settings.php writes admin password + kiosk settings here at runtime
RUN mkdir -p /var/www/html/storage \
    && chown -R www-data:www-data /var/www/html

EXPOSE 80
