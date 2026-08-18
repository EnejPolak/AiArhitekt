/**
 * Tests for Haversine distance calculation
 */

import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, haversineDistanceKm } from "./haversine";

describe("haversine", () => {
  describe("haversineDistanceMeters", () => {
    it("should calculate distance between Velenje and Ljubljana correctly", () => {
      // Velenje coordinates
      const velenjeLat = 46.3592;
      const velenjeLng = 15.1103;

      // Ljubljana coordinates
      const ljubljanaLat = 46.0569;
      const ljubljanaLng = 14.5058;

      const distance = haversineDistanceMeters(velenjeLat, velenjeLng, ljubljanaLat, ljubljanaLng);
      const distanceKm = distance / 1000;

      // Velenje to Ljubljana is approximately 60-70 km
      expect(distanceKm).toBeGreaterThan(50);
      expect(distanceKm).toBeLessThan(80);
    });

    it("should calculate distance between Velenje and Ajdovščina correctly", () => {
      // Velenje coordinates
      const velenjeLat = 46.3592;
      const velenjeLng = 15.1103;

      // Ajdovščina coordinates
      const ajdovscinaLat = 45.8869;
      const ajdovscinaLng = 13.9094;

      const distance = haversineDistanceMeters(velenjeLat, velenjeLng, ajdovscinaLat, ajdovscinaLng);
      const distanceKm = distance / 1000;

      // Velenje to Ajdovščina is approximately 100+ km
      expect(distanceKm).toBeGreaterThan(90);
      expect(distanceKm).toBeLessThan(120);
    });

    it("should return 0 for same coordinates", () => {
      const lat = 46.3592;
      const lng = 15.1103;

      const distance = haversineDistanceMeters(lat, lng, lat, lng);
      expect(distance).toBe(0);
    });

    it("should calculate short distances correctly (10km)", () => {
      // Velenje
      const lat1 = 46.3592;
      const lng1 = 15.1103;

      // Point approximately 10km away (rough estimate)
      const lat2 = 46.3592 + 0.09; // ~10km north
      const lng2 = 15.1103;

      const distance = haversineDistanceMeters(lat1, lng1, lat2, lng2);
      const distanceKm = distance / 1000;

      // Should be approximately 10km (allow some tolerance)
      expect(distanceKm).toBeGreaterThan(8);
      expect(distanceKm).toBeLessThan(12);
    });
  });

  describe("haversineDistanceKm", () => {
    it("should return distance in kilometers", () => {
      const lat1 = 46.3592;
      const lng1 = 15.1103;
      const lat2 = 46.0569;
      const lng2 = 14.5058;

      const distanceKm = haversineDistanceKm(lat1, lng1, lat2, lng2);
      const distanceMeters = haversineDistanceMeters(lat1, lng1, lat2, lng2);

      expect(distanceKm).toBeCloseTo(distanceMeters / 1000, 2);
    });
  });
});
