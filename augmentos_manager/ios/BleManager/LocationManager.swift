//
//  LocationManager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/16/25.
//

import Foundation
import CoreLocation

class LocationManager: NSObject, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private var locationChangedCallback: (() -> Void)?
  private var currentLocation: CLLocation?
  
  override init() {
    super.init()
    // delay setup until after login:
    // setup()
  }
  
  public func setup() {
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.distanceFilter = 10 // Update when user moves 10 meters
    locationManager.allowsBackgroundLocationUpdates = false
    locationManager.pausesLocationUpdatesAutomatically = true
    
    // Request authorization
    locationManager.requestWhenInUseAuthorization()
    
    // Start location updates
    locationManager.startUpdatingLocation()
  }
  
  func setLocationChangedCallback(_ callback: @escaping () -> Void) {
    self.locationChangedCallback = callback
  }
  
  // MARK: - CLLocationManagerDelegate Methods
  
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else { return }
    
    // Only process significant changes (>10m or first location)
    if currentLocation == nil || location.distance(from: currentLocation!) > 10 {
      currentLocation = location
      
      // Notify via callback
      locationChangedCallback?()
    }
  }
  
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    print("LocationManager: Failed to get location. Error: \(error.localizedDescription)")
  }
  
  func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
    switch status {
    case .authorizedWhenInUse, .authorizedAlways:
      locationManager.startUpdatingLocation()
    case .denied, .restricted:
      print("LocationManager: Location access denied or restricted")
    case .notDetermined:
      print("LocationManager: Location permission not determined yet")
    @unknown default:
      print("LocationManager: Unknown authorization status")
    }
  }
  
  // MARK: - Location Getters
  
  func getCurrentLocation() -> (latitude: Double, longitude: Double)? {
    guard let location = currentLocation else { return nil }
    return (latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
  }
  
  func getLastKnownLocation() -> (latitude: Double, longitude: Double)? {
    return getCurrentLocation()
  }
}
