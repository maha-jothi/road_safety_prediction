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

// Weather Map Layer State
let weatherMapLayer = L.layerGroup();

document.getElementById('btn-weather-layer').addEventListener('click', async (e) => {
    e.target.classList.toggle('active');
    const isActive = e.target.classList.contains('active');
    
    if (isActive) {
        try {
            const response = await fetch(`${API_BASE}/weather_map`);
            const data = await response.json();
            
            data.forEach(pt => {
                let iconStr = "☀️";
                if (pt.weather === 1) iconStr = "🌧️";
                else if (pt.weather === 2) iconStr = "🌫️";
                
                const bgColor = pt.risk === 1 ? "#fce8e6" : "#e6f4ea";
                const borderColor = pt.risk === 1 ? "#ef4444" : "#10b981";
                
                const customIcon = L.divIcon({
                    html: `<div style="background-color: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); line-height: 1;">${iconStr}</div>`,
                    className: '',
                    iconSize: [26, 26],
                    iconAnchor: [13, 13]
                });
                
                L.marker([pt.lat, pt.lng], { icon: customIcon }).addTo(weatherMapLayer);
            });
            
            weatherMapLayer.addTo(map);
        } catch (err) {
            console.error("Failed to load weather map:", err);
        }
    } else {
        weatherMapLayer.clearLayers();
        if (map.hasLayer(weatherMapLayer)) {
            map.removeLayer(weatherMapLayer);
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
    const recContainer = document.getElementById('safety-recommendations');
    
    if (routeModeActive) {
        routeForm.classList.remove('hidden');
        card.classList.remove('hidden');
        card.className = 'prediction-card safe';
        document.getElementById('result-status').innerText = '📍 Select Start & End';
        document.getElementById('result-score').innerText = '--';
        document.getElementById('result-coords').innerText = 'Awaiting Input...';
        if (recContainer) recContainer.classList.add('hidden');
        
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

let lastSinglePoint = null;

async function handleSinglePointPrediction(lat, lng) {
    lastSinglePoint = {lat, lng};
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
        const weather = document.getElementById('weather-input') ? parseInt(document.getElementById('weather-input').value) : 0;
        
        const response = await fetch(`${API_BASE}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, weather })
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
        
        const weather = document.getElementById('weather-input') ? parseInt(document.getElementById('weather-input').value) : 0;
        
        // Send to backend
        const predictionResponse = await fetch(`${API_BASE}/predict_route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: sampledPoints, weather: weather })
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
    let overallSafeSpeed = predictions.some(p => !p.is_safe) ? "Max 20 km/h (Caution)" : (predictions[0] ? predictions[0].safe_speed : "Normal");
    document.getElementById('result-score').innerText = avgRisk.toFixed(1);
    
    if (document.getElementById('result-speed')) {
        document.getElementById('result-speed').innerText = overallSafeSpeed;
    }
    
    // Add weather indicators sporadically along the route
    const wVal = document.getElementById('weather-input') ? parseInt(document.getElementById('weather-input').value) : 0;
    let iconStr = "☀️";
    if (wVal === 1) iconStr = "🌧️";
    else if (wVal === 2) iconStr = "🌫️";
    
    const numMarkers = Math.min(6, Math.max(2, Math.floor(coordinates.length / 10)));
    const stepSize = Math.floor(coordinates.length / numMarkers);
    if (stepSize > 0) {
        for(let i=stepSize; i<coordinates.length-1; i+=stepSize) {
            const pt = coordinates[i];
            const weatherIcon = L.divIcon({
                html: `<div style="background: white; border-radius: 50%; font-size: 12px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.4); line-height: 1;">${iconStr}</div>`,
                className: '', iconSize: [20, 20], iconAnchor: [10, 10]
            });
            const m = L.marker([pt[1], pt[0]], { icon: weatherIcon, interactive: false }).addTo(map);
            routeLayers.push(m);
        }
    }
    
    const card = document.getElementById('prediction-result');
    const recContainer = document.getElementById('safety-recommendations');
    const recList = document.getElementById('recommendations-list');
    
    if (avgRisk < 30) {
        card.className = 'prediction-card safe';
        document.getElementById('result-status').innerText = '🛡️ Safe Route Generated';
        if (recContainer) recContainer.classList.add('hidden');
    } else {
        if (avgRisk < 60) {
            card.className = 'prediction-card';
            document.getElementById('result-status').innerText = '⚠️ Moderate Risk Route';
        } else {
            card.className = 'prediction-card danger';
            document.getElementById('result-status').innerText = '🚨 High Risk Route';
        }
        
        let allRecs = new Set();
        predictions.forEach(p => {
            if (p.recommendations) {
                p.recommendations.forEach(r => allRecs.add(r));
            }
        });
        
        if (allRecs.size > 0 && recContainer && recList) {
            recList.innerHTML = '';
            Array.from(allRecs).slice(0, 4).forEach(r => {
                const li = document.createElement('li');
                li.innerText = r;
                recList.appendChild(li);
            });
            recContainer.classList.remove('hidden');
        } else if (recContainer) {
            recContainer.classList.add('hidden');
        }
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
    if (document.getElementById('result-speed')) document.getElementById('result-speed').innerText = '--';
    document.getElementById('result-coords').innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    
    const recContainer = document.getElementById('safety-recommendations');
    if (recContainer) recContainer.classList.add('hidden');
    
    // Hide gmaps link until ready
    const gmapsLink = document.getElementById('gmaps-link');
    if (gmapsLink) gmapsLink.classList.add('hidden');
}

function updatePredictionUI(data, lat, lng) {
    const card = document.getElementById('prediction-result');
    const recContainer = document.getElementById('safety-recommendations');
    const recList = document.getElementById('recommendations-list');
    
    // Change marker color based on ML output
    if (currentMarker) {
        currentMarker.setStyle({
            fillColor: data.is_safe ? "#10b981" : "#ef4444"
        });
    }

    if (data.is_safe) {
        card.className = 'prediction-card safe';
        document.getElementById('result-status').innerText = '🛡️ Safe Location';
        if (recContainer) recContainer.classList.add('hidden');
    } else {
        card.className = 'prediction-card danger';
        document.getElementById('result-status').innerText = '⚠️ High Accident Zone';
        
        if (data.recommendations && data.recommendations.length > 0 && recContainer && recList) {
            recList.innerHTML = '';
            data.recommendations.forEach(r => {
                const li = document.createElement('li');
                li.innerText = r;
                recList.appendChild(li);
            });
            recContainer.classList.remove('hidden');
        } else if (recContainer) {
            recContainer.classList.add('hidden');
        }
    }
    
    document.getElementById('result-score').innerText = data.risk_score;
    if (document.getElementById('result-speed')) {
        document.getElementById('result-speed').innerText = data.safe_speed || '--';
    }
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

// Auto-update when weather input changes
const weatherInputNode = document.getElementById('weather-input');
if(weatherInputNode) {
    weatherInputNode.addEventListener('change', () => {
        const sInput = document.getElementById('start-input');
        const eInput = document.getElementById('end-input');
        
        if (routeModeActive && sInput && eInput && sInput.value && eInput.value && !document.getElementById('route-inputs').classList.contains('hidden')) {
            document.getElementById('btn-calculate').click();
        } else if (!routeModeActive && lastSinglePoint) {
            handleSinglePointPrediction(lastSinglePoint.lat, lastSinglePoint.lng);
        }
    });
}

// Initial draw of heatmap
loadHeatmap();
