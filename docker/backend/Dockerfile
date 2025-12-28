# syntax=docker/dockerfile:1.6

FROM php:8.3-fpm

ARG USER_ID=1000
ARG GROUP_ID=1000

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        unzip \
        libpq-dev \
        libzip-dev \
        libicu-dev \
        g++ \
        libonig-dev \
        libxml2-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libfreetype6-dev \
        libmagickwand-dev \
        postgresql-client \
        netcat-openbsd \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-configure intl \
    && docker-php-ext-install \
        intl \
        pdo_pgsql \
        bcmath \
        pcntl \
        opcache \
        gd \
        zip \
        soap \
    && pecl install redis \
    && pecl install imagick \
    && docker-php-ext-enable redis imagick \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

RUN if ! getent group ${GROUP_ID} > /dev/null; then \
        groupadd --gid ${GROUP_ID} appuser; \
    else \
        groupmod --new-name appuser $(getent group ${GROUP_ID} | cut -d: -f1); \
    fi \
    && if ! id -u ${USER_ID} > /dev/null 2>&1; then \
        useradd --uid ${USER_ID} --gid ${GROUP_ID} --home /var/www --create-home appuser; \
    else \
        usermod --login appuser --home /var/www $(getent passwd ${USER_ID} | cut -d: -f1) && mkdir -p /var/www; \
    fi

WORKDIR /var/www

COPY docker/backend/php.ini /usr/local/etc/php/conf.d/99-custom.ini
COPY docker/backend/opcache.ini /usr/local/etc/php/conf.d/99-opcache.ini
COPY docker/backend/php-fpm-override.conf /usr/local/etc/php-fpm.d/zz-override.conf
COPY docker/backend/start-container.sh /usr/local/bin/start-container.sh
RUN chmod +x /usr/local/bin/start-container.sh

USER appuser

CMD ["php-fpm"]
