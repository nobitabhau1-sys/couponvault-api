FROM php:8.2-apache

# Enable Apache mod_rewrite for custom routing
RUN a2enmod rewrite

# Set working directory inside container
WORKDIR /var/www/html

# Copy all repository contents into container
COPY . /var/www/html/

# Initialize collected_data.json if not present and grant full read/write permissions
RUN touch /var/www/html/collected_data.json && \
    chmod 777 /var/www/html/collected_data.json && \
    chown -R www-data:www-data /var/www/html/

# Expose HTTP port 80
EXPOSE 80

CMD ["apache2-foreground"]
