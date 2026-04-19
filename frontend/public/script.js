// Initialize Map roughly centered on Chennai
// Uses [Lat, Lng]
const map = L.map('map', {
    zoomControl: false
}).setView([13.0827, 80.2707], 12);

L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Add Google Maps overlay layout for realistic UI
L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains:['mt0','mt1','mt2','mt3'],
    attribution: '© Google Maps'
}).addTo(map);

let heatLayer = null;
let currentMarker = null;

// Route Mode State - Enabled by default now
let routeModeActive = true;
let routeStartPoint = null;
let routeEndPoint = null;
let routeLayers = [];
let routeMarkers = [];

// The Python backend endpoint handling ML predictions
const API_BASE = 'http://localhost:5000/api';

// Fetch heatmap data and overlay it mapping accident prone zones
async function loadHeatmap() {
    try {
        const response = await fetch(`${API_BASE}/accidents`);
        if (!response.ok) throw new Error("Failed to fetch heatmap data");
        const points = await response.json();
        
        // Heatmap config via Leaflet.heat
        heatLayer = L.heatLayer(points, {
            radius: 25,
            blur: 15,
            maxZoom: 17,
            gradient: {
                0.4: 'yellow',
                0.6: 'orange',
                1.0: 'red'
            }
        }).addTo(map);
    } catch (error) {
        console.error("Error loading heatmap:", error);
    }
}

document.getElementById('btn-heatmap').addEventListener('click', (e) => {
    e.target.classList.toggle('active');
    if (heatLayer) {
        if (map.hasLayer(heatLayer)) {
            map.removeLayer(heatLayer);
        } else {
            map.addLayer(heatLayer);
        }
    }
});

// Safe Routes mapping logic
document.getElementById('btn-routes').addEventListener('click', (e) => {
    e.target.classList.toggle('active');
    routeModeActive = e.target.classList.contains('active');
    
    // Reset state
    routeStartPoint = null;
    routeEndPoint = null;
    clearRoute();
    
    document.getElementById('start-input').value = '';
    document.getElementById('end-input').value = '';
    delete document.getElementById('start-input').dataset.lat;
    delete document.getElementById('start-input').dataset.lng;
    delete document.getElementById('end-input').dataset.lat;
    delete document.getElementById('end-input').dataset.lng;
    
    const card = document.getElementById('prediction-result');
    const routeForm = document.getElementById('route-inputs');
    
    if (routeModeActive) {
        routeForm.classList.remove('hidden');
        card.classList.remove('hidden');
        card.className = 'prediction-card safe';
        document.getElementById('result-status').innerText = '📍 Select Start & End';
        document.getElementById('result-score').innerText = '--';
        document.getElementById('result-coords').innerText = 'Awaiting Input...';
        
        // Remove single point marker
        if (currentMarker) {
            map.removeLayer(currentMarker);
            currentMarker = null;
        }
    } else {
        routeForm.classList.add('hidden');
        card.classList.add('hidden');
        document.getElementById('result-status').innerText = '🚘 SafeRoute AI';
    }
});

// Ensure routing UI is engaged on load
setTimeout(() => {
    const btnRoutes = document.getElementById('btn-routes');
    if (!btnRoutes.classList.contains('active')) {
        btnRoutes.click();
    }
}, 500);

function clearRoute() {
    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];
    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeMarkers = [];
}

// Map click event for making ML safety inferences or routing
map.on('click', async function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    document.getElementById('prediction-result').classList.remove('hidden');

    if (routeModeActive) {
        handleRouteSelection(lat, lng);
    } else {
        handleSinglePointPrediction(lat, lng);
    }
});

async function handleSinglePointPrediction(lat, lng) {
    // Add visual marker on click
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    
    currentMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: "#3b82f6",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);

    showPredictionLoading(lat, lng);

    try {
        const response = await fetch(`${API_BASE}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng })
        });
        
        const data = await response.json();
        updatePredictionUI(data, lat, lng);

    } catch (error) {
        console.error("Prediction API error:", error);
        document.getElementById('result-status').innerText = 'Backend Unreachable';
    }
}

async function handleRouteSelection(lat, lng) {
    const startInput = document.getElementById('start-input');
    const endInput = document.getElementById('end-input');

    if (!routeStartPoint) {
        clearRoute();
        routeStartPoint = {lat, lng};
        
        // Start marker (Green)
        const marker = L.circleMarker([lat, lng], {
            radius: 8, fillColor: "#10b981", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1
        }).addTo(map);
        routeMarkers.push(marker);
        
        // Update input
        startInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        startInput.dataset.lat = lat;
        startInput.dataset.lng = lng;
        
        document.getElementById('result-status').innerText = '📍 Pick End Point or type';
        document.getElementById('result-coords').innerText = `Start: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } else if (!routeEndPoint) {
        routeEndPoint = {lat, lng};
        
        // End marker (Red)
        const marker = L.circleMarker([lat, lng], {
            radius: 8, fillColor: "#ef4444", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1
        }).addTo(map);
        routeMarkers.push(marker);
        
        // Update input
        endInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        endInput.dataset.lat = lat;
        endInput.dataset.lng = lng;
        
        document.getElementById('result-status').innerText = '🔄 Fetching Route...';
        document.getElementById('result-coords').innerText = `Calculating...`;
        
        await calculateAndDrawRoute(routeStartPoint, routeEndPoint);
        
        // Reset so next click is a new start point
        routeStartPoint = null;
        routeEndPoint = null;
    }
}

async function calculateAndDrawRoute(start, end) {
    try {
        // OSRM URL format: longitude,latitude
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
        
        const response = await fetch(osrmUrl);
        const data = await response.json();
        
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error("Route not found");
        }
        
        const coordinates = data.routes[0].geometry.coordinates;
        
        document.getElementById('result-status').innerText = '🧠 Analyzing Safety...';
        
        // Sample points along the route
        const step = Math.max(1, Math.floor(coordinates.length / 50));
        const sampledPoints = [];
        for (let i = 0; i < coordinates.length; i += step) {
            sampledPoints.push({
                lng: coordinates[i][0],
                lat: coordinates[i][1]
            });
        }
        
        // Ensure the last point is included for coverage
        if (sampledPoints[sampledPoints.length - 1].lng !== coordinates[coordinates.length - 1][0]) {
            sampledPoints.push({
                lng: coordinates[coordinates.length - 1][0],
                lat: coordinates[coordinates.length - 1][1]
            });
        }
        
        // Send to backend
        const predictionResponse = await fetch(`${API_BASE}/predict_route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: sampledPoints })
        });
        
        if (!predictionResponse.ok) {
            throw new Error("Failed to predict route safety");
        }
        
        const predictionResults = await predictionResponse.json();
        
        drawSafeRouteWithPredictions(coordinates, predictionResults);
        
    } catch (error) {
        console.error("Routing error:", error);
        document.getElementById('result-status').innerText = '❌ Routing Error';
    }
}

function drawSafeRouteWithPredictions(coordinates, predictions) {
    function getSafetyForPoint(lng, lat) {
        let minDist = Infinity;
        let match = predictions[0];
        predictions.forEach(p => {
            const dist = Math.pow(p.lng - lng, 2) + Math.pow(p.lat - lat, 2);
            if (dist < minDist) {
                minDist = dist;
                match = p;
            }
        });
        return match;
    }
    
    // Clear old route segments
    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];

    let totalRisk = 0;
    
    for (let i = 0; i < coordinates.length - 1; i++) {
        const start = coordinates[i];
        const end = coordinates[i+1];
        
        const midLng = (start[0] + end[0]) / 2;
        const midLat = (start[1] + end[1]) / 2;
        
        const safety = getSafetyForPoint(midLng, midLat);
        
        const color = safety.is_safe ? '#10b981' : '#ef4444'; // green : red
        
        // Shadow/border layer for Google Maps nav style
        const shadow = L.polyline([
            [start[1], start[0]], 
            [end[1], end[0]]
        ], {
            color: '#1a73e8', // Default blue border around route segments
            weight: 10,
            opacity: 0.3,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
        routeLayers.push(shadow);

        const polyline = L.polyline([
            [start[1], start[0]], 
            [end[1], end[0]]
        ], {
            color: color,
            weight: 6,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
        
        routeLayers.push(polyline);
    }
    
    // Zoom strictly to the calculated route
    const allLatLngs = coordinates.map(c => [c[1], c[0]]);
    const routeBounds = L.latLngBounds(allLatLngs);
    map.fitBounds(routeBounds, { 
        padding: [60, 60], 
        maxZoom: 17, 
        animate: true,
        duration: 1.5 
    });

    // Calculate average risk
    let avgRisk = predictions.reduce((acc, p) => acc + p.risk_score, 0) / predictions.length;
    document.getElementById('result-score').innerText = avgRisk.toFixed(1);
    
    const card = document.getElementById('prediction-result');
    if (avgRisk < 30) {
        card.className = 'prediction-card safe';
        document.getElementById('result-status').innerText = '🛡️ Safe Route Generated';
    } else if (avgRisk < 60) {
        card.className = 'prediction-card';
        document.getElementById('result-status').innerText = '⚠️ Moderate Risk Route';
    } else {
        card.className = 'prediction-card danger';
        document.getElementById('result-status').innerText = '🚨 High Risk Route';
    }
    
    document.getElementById('result-coords').innerText = `Analyzed ${predictions.length} segments`;
    
    // Export to real Google Maps URL
    const gmapsLink = document.getElementById('gmaps-link');
    if (gmapsLink && coordinates.length > 0) {
        const startH = coordinates[0];
        const endH = coordinates[coordinates.length-1];
        // Ensure some key waypoints are grabbed so Google replicates the exact same route properly
        const midH = coordinates[Math.floor(coordinates.length / 2)];
        
        gmapsLink.href = `https://www.google.com/maps/dir/${startH[1]},${startH[0]}/${midH[1]},${midH[0]}/${endH[1]},${endH[0]}`;
        gmapsLink.classList.remove('hidden');
    }
}

function showPredictionLoading(lat, lng) {
    const card = document.getElementById('prediction-result');
    card.className = 'prediction-card'; // Removes hidden, danger, safe classes
    document.getElementById('result-status').innerText = 'Analyzing Route...';
    document.getElementById('result-score').innerText = '--';
    document.getElementById('result-coords').innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    
    // Hide gmaps link until ready
    const gmapsLink = document.getElementById('gmaps-link');
    if (gmapsLink) gmapsLink.classList.add('hidden');
}

function updatePredictionUI(data, lat, lng) {
    const card = document.getElementById('prediction-result');
    
    // Change marker color based on ML output
    if (currentMarker) {
        currentMarker.setStyle({
            fillColor: data.is_safe ? "#10b981" : "#ef4444"
        });
    }

    if (data.is_safe) {
        card.className = 'prediction-card safe';
        document.getElementById('result-status').innerText = '🛡️ Safe Location';
    } else {
        card.className = 'prediction-card danger';
        document.getElementById('result-status').innerText = '⚠️ High Accident Zone';
    }
    
    document.getElementById('result-score').innerText = data.risk_score;
}

// Autocomplete functionality
let searchTimeout = null;

function setupAutocomplete(inputId, suggestionBoxId) {
    const input = document.getElementById(inputId);
    const suggestionBox = document.getElementById(suggestionBoxId);
    
    input.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length < 3) {
            suggestionBox.classList.add('hidden');
            return;
        }

        // Allow coordinates like "13.08, 80.27" directly mapping without API
        const coordMatch = query.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
        if (coordMatch) {
            suggestionBox.classList.add('hidden');
            input.dataset.lat = coordMatch[1];
            input.dataset.lng = coordMatch[3];
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                // Use Nominatim API for geocoding
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
                const data = await response.json();
                
                suggestionBox.innerHTML = '';
                if (data.length > 0) {
                    suggestionBox.classList.remove('hidden');
                    data.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.innerText = item.display_name;
                        div.addEventListener('click', () => {
                            input.value = item.name || item.display_name.split(',')[0];
                            input.dataset.lat = item.lat;
                            input.dataset.lng = item.lon;
                            suggestionBox.classList.add('hidden');
                            
                            // Visualize marker for point
                            const marker = L.circleMarker([item.lat, item.lon], {
                                radius: 8, fillColor: inputId.includes('start') ? "#10b981" : "#ef4444", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1
                            }).addTo(map);
                            routeMarkers.push(marker);
                            
                            // Map pan to marker
                            map.setView([item.lat, item.lon], 13);
                            
                            if (inputId === 'start-input') routeStartPoint = {lat: parseFloat(item.lat), lng: parseFloat(item.lon)};
                            if (inputId === 'end-input') routeEndPoint = {lat: parseFloat(item.lat), lng: parseFloat(item.lon)};
                            
                            // Auto trigger full route calculation just like Google Maps when both are selected
                            if (document.getElementById('start-input').value && document.getElementById('end-input').value) {
                                document.getElementById('btn-calculate').click();
                            }
                        });
                        suggestionBox.appendChild(div);
                    });
                } else {
                    suggestionBox.classList.add('hidden');
                }
            } catch (err) {
                console.error('Autocomplete error:', err);
            }
        }, 500);
    });

    // Close on clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== suggestionBox) {
            suggestionBox.classList.add('hidden');
        }
    });
}

setupAutocomplete('start-input', 'start-suggestions');
setupAutocomplete('end-input', 'end-suggestions');

document.getElementById('btn-calculate').addEventListener('click', async () => {
    const sInput = document.getElementById('start-input');
    const eInput = document.getElementById('end-input');
    
    const sLat = parseFloat(sInput.dataset.lat);
    const sLng = parseFloat(sInput.dataset.lng);
    const eLat = parseFloat(eInput.dataset.lat);
    const eLng = parseFloat(eInput.dataset.lng);
    
    if (isNaN(sLat) || isNaN(sLng) || isNaN(eLat) || isNaN(eLng)) {
        alert("Please ensure both start and end locations are valid. Select from dropdown or map.");
        return;
    }
    
    // Clear and redraw route
    clearRoute();
    routeStartPoint = {lat: sLat, lng: sLng};
    routeEndPoint = {lat: eLat, lng: eLng};
    
    // Start marker (Green)
    const m1 = L.circleMarker([sLat, sLng], {
        radius: 8, fillColor: "#10b981", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1
    }).addTo(map);
    routeMarkers.push(m1);
    
    // End marker (Red)
    const m2 = L.circleMarker([eLat, eLng], {
        radius: 8, fillColor: "#ef4444", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1
    }).addTo(map);
    routeMarkers.push(m2);

    document.getElementById('result-status').innerText = '🔄 Fetching Route...';
    document.getElementById('result-coords').innerText = `Calculating...`;
    
    // Initial jump to bounds of both endpoints
    const bounds = L.latLngBounds([[sLat, sLng], [eLat, eLng]]);
    map.fitBounds(bounds, { padding: [80, 80] });

    await calculateAndDrawRoute(routeStartPoint, routeEndPoint);
    
    routeStartPoint = null;
    routeEndPoint = null;
});

// Initial draw of heatmap
loadHeatmap();
