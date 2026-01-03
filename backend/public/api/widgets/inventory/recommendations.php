<?php
// Public widget endpoint - served directly by Nginx
// This file is served as a PHP script directly without going through Laravel routing

header('Content-Type: application/javascript; charset=utf-8');

// For now, return a simple script that will work through the normal Laravel route
// The actual data will be fetched from the protected /api/inventory/recommendations/products endpoint
?>
(function() {
    const productId = new URLSearchParams(window.location.search).get('product_id');
    const limit = new URLSearchParams(window.location.search).get('limit') || 8;
    const containerId = new URLSearchParams(window.location.search).get('container') || 'reco-product';
    
    if (!productId) {
        console.warn('Widget: product_id parameter missing');
        return;
    }
    
    // Fetch recommendations from the protected API endpoint
    const url = `/api/inventory/recommendations/products?product_id=${productId}&limit=${limit}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (!data.products || data.products.length === 0) {
                console.log('No recommendations found');
                return;
            }
            
            // Insert widget HTML
            const container = document.getElementById(containerId);
            if (!container) return;
            
            const html = data.products
                .slice(0, limit)
                .map(p => `<div class="reco-item"><a href="${p.url}">${p.name}</a></div>`)
                .join('');
                
            container.innerHTML = `<div class="reco-products">${html}</div>`;
        })
        .catch(err => console.error('Widget error:', err));
})();
