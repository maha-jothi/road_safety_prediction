import os
import sys

# Ensure backend directory is in path so internal imports work regardless of execution directory
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import pandas as pd

# Use absolute path for frontend static files
frontend_dir = os.path.abspath(os.path.join(current_dir, '..', 'frontend', 'public'))
app = Flask(__name__, static_folder=frontend_dir, static_url_path='/')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

MODEL_PATH = os.path.join(current_dir, 'model.pkl')
CSV_PATH = os.path.join(current_dir, 'accidents.csv')

# Initialize model and data strictly on startup
if not os.path.exists(CSV_PATH):
    from data_generator import generate_mock_data
    generate_mock_data()

if not os.path.exists(MODEL_PATH):
    from ml_model import train_and_save_model
    train_and_save_model()

model = None
with open(MODEL_PATH, 'rb') as f:
    model = pickle.load(f)

@app.route('/api/accidents', methods=['GET'])
def get_accidents():
    """Return heatmap points."""
    df = pd.read_csv(CSV_PATH)
    highly_prone = df[df['risk'] == 1]
    points = highly_prone[['latitude', 'longitude']].values.tolist()
    return jsonify(points)

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.json
    lat = data.get('lat')
    lng = data.get('lng')
    
    if not lat or not lng:
        return jsonify({'error': 'Lat and lng required'}), 400
        
    prediction = model.predict([[lat, lng]])
    probabilities = model.predict_proba([[lat, lng]])
    
    risk_prob = probabilities[0][1] # Probability of being class 1 (High Risk)
    
    is_safe = bool(prediction[0] == 0)
    
    return jsonify({
        'is_safe': is_safe,
        'risk_score': round(risk_prob * 100, 2),
        'message': 'Safe Route' if is_safe else 'High Accident Zone'
    })

@app.route('/api/predict_route', methods=['POST'])
def predict_route():
    data = request.json
    points = data.get('points')
    
    if not points or not isinstance(points, list):
        return jsonify({'error': 'Points list required'}), 400
        
    # Format points for prediction
    coords = [[p['lat'], p['lng']] for p in points]
    
    # Predict all at once
    predictions = model.predict(coords)
    probabilities = model.predict_proba(coords)
    
    results = []
    for i, p in enumerate(points):
        risk_prob = probabilities[i][1]
        is_safe = bool(predictions[i] == 0)
        results.append({
            'lat': p['lat'],
            'lng': p['lng'],
            'is_safe': is_safe,
            'risk_score': round(risk_prob * 100, 2)
        })
        
    return jsonify(results)

if __name__ == '__main__':
    app.run(port=5000, debug=True)
