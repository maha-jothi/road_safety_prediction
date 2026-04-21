import pandas as pd
import numpy as np
import os

def generate_mock_data():
    np.random.seed(42)
    # Chennai bounding box roughly
    # center: 13.0827, 80.2707
    
    # cluster 1: high risk junction A
    lat1 = np.random.normal(13.0850, 0.005, 400)
    lng1 = np.random.normal(80.2750, 0.005, 400)
    
    # cluster 2: high risk stretch B
    lat2 = np.random.normal(13.0650, 0.01, 300)
    lng2 = np.random.normal(80.2400, 0.01, 300)
    
    # Random spread
    lat3 = np.random.uniform(13.00, 13.15, 800)
    lng3 = np.random.uniform(80.15, 80.35, 800)
    
    lats = np.concatenate([lat1, lat2, lat3])
    lngs = np.concatenate([lng1, lng2, lng3])
    # generate weather randomly (0: Clear, 1: Rain, 2: Fog)
    weathers = np.random.choice([0, 1, 2], size=len(lats), p=[0.6, 0.3, 0.1])
    
    # Risk factor formula based on distance to the clusters and weather
    # 0 = Safe, 1 = High Risk
    risk_labels = []
    for lat, lng, w in zip(lats, lngs, weathers):
        dist1 = np.sqrt((lat - 13.0850)**2 + (lng - 80.2750)**2)
        dist2 = np.sqrt((lat - 13.0650)**2 + (lng - 80.2400)**2)
        
        base_risk = 0
        if dist1 < 0.01 or dist2 < 0.015:
            base_risk = 1
            
        # Increase risk if weather is bad
        if w == 1 and np.random.rand() < 0.3: # Rain
            base_risk = 1
        elif w == 2 and np.random.rand() < 0.5: # Fog
            base_risk = 1
            
        if base_risk == 1:
            risk_labels.append(1) # High Risk
        else:
            options = [0, 1]
            risk_labels.append(options[np.random.choice([0, 1], p=[0.8, 0.2])])
            
    df = pd.DataFrame({
        'latitude': lats,
        'longitude': lngs,
        'weather': weathers,
        'risk': risk_labels
    })
    
    # Use accurate base directory since working directory might differ
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(current_dir, 'accidents.csv')
    df.to_csv(csv_path, index=False)
    print(f"Mock dataset generated at {csv_path}")

if __name__ == "__main__":
    generate_mock_data()
