import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";

interface LocationState {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

interface UseLocationResult {
  location: LocationState | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getLocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setError("Se necesita permiso de ubicación para usar esta función");
      setIsLoading(false);
      return;
    }

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        timestamp: loc.timestamp,
      });
    } catch (e) {
      setError("No se pudo obtener la ubicación. Verifica que el GPS esté activo.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    getLocation();
  }, [getLocation]);

  return { location, error, isLoading, refresh: getLocation };
}
