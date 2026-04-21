# AI Road Accident Prediction and Safe Route Mapping System

This project is an AI-powered web application that visualizes accident-prone zones and provides safety inferences for specific routes. It features a Google Maps-inspired interface that allows users to find the safest path between a starting point and a destination.

## Features
- **Interactive Map Interface**: A Google Maps-style UI built using Leaflet.js for high performance and responsiveness.
- **Route Safety Prediction**: Evaluates road segments using a Machine Learning model to determine high-risk areas versus safe passages.
- **Accident Zone Visualization**: Displays known accident hotspots and historical data on the map.
- **Dynamic Routing**: Calculates paths between user-specified start and end points and automatically adjusts the map view to fit the route.

## Project Structure
- `backend/`: Contains the Python API and Machine Learning components.
  - `app.py`: The main Flask application serving the backend API.
  - `ml_model.py`: Core machine learning model logic for predicting accident probabilities.
  - `data_generator.py`: Script used to generate the dataset (`accidents.csv`) for model training.
  - `requirements.txt`: List of Python dependencies required to run the backend.
- `frontend/public/`: Contains the frontend web interface.
  - `index.html`: Main HTML layout of the application.
  - `style.css`: Custom styling for the Google Maps-inspired user interface.
  - `script.js`: Frontend logic, Leaflet map configuration, and API communication.

## Setup Instructions

### Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Flask server:
   ```bash
   python app.py
   ```
   *The server should run on `http://localhost:5000` (or similar, depending on your configuration).*
### Frontend Setup
1. Change into the `frontend/public` directory or host it directly:
   ```bash
   cd frontend/public
   ```
2. You can often open the `index.html` file directly in your browser. However, for full functionality (especially API calls/CORS requirements), it is recommended to run a lightweight local server:
   Using Python:
   ```bash
   python -m http.server 8000
   ```
   Using Node.js:
   ```bash
   npx serve
   ``` 
3. Open `http://localhost:8000` (or the port specified by your local server) in your web browser.

## Technologies Used
- **Frontend**: HTML5, Vanilla CSS, JavaScript, [Leaflet.js](https://leafletjs.com/)
- **Backend**: Python, [Flask](https://flask.palletsprojects.com/)
- **Machine Learning**: Python-based ML tools
