import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

// R3F intentionally loses its WebGL context after unmount. Remove our listener
// first so switching game modes never reports that normal cleanup as a failure.
export function GraphicsLifecycle({ onLost, onReady }: { onLost: () => void; onReady?: () => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    canvas.addEventListener('webglcontextlost', lost);
    onReady?.();
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onLost, onReady]);
  return null;
}
