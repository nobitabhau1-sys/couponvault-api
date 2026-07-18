FROM php:8.2-cli
WORKDIR /app
COPY . /app
EXPOSE 80
CMD ["php", "-S", "0.0.0.0:80", "receive.php"]
