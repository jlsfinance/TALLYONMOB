import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    Float,
    MeshDistortMaterial,
    PerspectiveCamera,
    Environment,
    PresentationControls,
    Html
} from '@react-three/drei';
import * as THREE from 'three';

function FloatingCard() {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        meshRef.current.rotation.x = Math.cos(t / 4) / 8;
        meshRef.current.rotation.y = Math.sin(t / 4) / 8;
        meshRef.current.position.y = (1 + Math.sin(t / 1.5)) / 10;
    });

    return (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
            <mesh ref={meshRef}>
                <boxGeometry args={[3.5, 2.2, 0.1]} />
                <meshPhysicalMaterial
                    color="#ffffff"
                    transmission={0.9}
                    thickness={0.5}
                    roughness={0.1}
                    metalness={0.2}
                    clearcoat={1}
                    envMapIntensity={1}
                />
                {/* Dashboard Mockup Content */}
                <Html transform position={[0, 0, 0.051]} distanceFactor={3}>
                    <div className="w-[350px] h-[220px] bg-black/80 rounded-lg p-4 border border-white/20 overflow-hidden pointer-events-none select-none">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-red-500/50" />
                                <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                                <div className="w-2 h-2 rounded-full bg-green-500/50" />
                            </div>
                            <div className="h-1.5 w-20 bg-white/10 rounded-full" />
                        </div>
                        <div className="space-y-3">
                            <div className="h-12 w-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-lg border border-cyan-500/10 flex items-center px-3">
                                <div className="h-2 w-1/2 bg-cyan-400/50 rounded-full" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="h-20 bg-white/5 rounded-lg border border-white/5" />
                                <div className="h-20 bg-white/5 rounded-lg border border-white/5" />
                            </div>
                            <div className="h-10 w-full bg-white/5 rounded-lg flex items-center px-3">
                                <div className="h-1.5 w-3/4 bg-white/10 rounded-full" />
                            </div>
                        </div>
                    </div>
                </Html>
            </mesh>
        </Float>
    );
}

function AnimatedOrb({ position, color, size = 1 }: { position: [number, number, number], color: string, size?: number }) {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        meshRef.current.position.y += Math.sin(t * 0.5) * 0.005;
        meshRef.current.position.x += Math.cos(t * 0.5) * 0.005;
    });

    return (
        <mesh ref={meshRef} position={position}>
            <sphereGeometry args={[size, 64, 64]} />
            <MeshDistortMaterial
                color={color}
                speed={2}
                distort={0.4}
                radius={1}
                emissive={color}
                emissiveIntensity={0.5}
                transparent
                opacity={0.6}
            />
        </mesh>
    );
}

function Particles({ count = 100 }) {
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 15;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 15;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 15;
        }
        return pos;
    }, [count]);

    const meshRef = useRef<THREE.Points>(null!);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        meshRef.current.rotation.y = t * 0.05;
    });

    return (
        <points ref={meshRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={positions.length / 3}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.02}
                color="#25d1f4"
                transparent
                opacity={0.6}
                sizeAttenuation
            />
        </points>
    );
}

export default function ThreeDHeroScene() {
    return (
        <div className="absolute inset-0 z-0">
            <Canvas shadows gl={{ antialias: true, alpha: true }}>
                <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={50} />

                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} color="#25d1f4" />
                <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />
                <spotLight position={[0, 10, 0]} intensity={1} angle={0.3} penumbra={1} castShadow />

                <PresentationControls
                    global
                    config={{ mass: 2, tension: 500 }}
                    snap={{ mass: 4, tension: 1500 }}
                    rotation={[0, 0, 0]}
                    polar={[-Math.PI / 12, Math.PI / 12]}
                    azimuth={[-Math.PI / 6, Math.PI / 6]}
                >
                    <FloatingCard />
                </PresentationControls>

                <AnimatedOrb position={[-4, 2, -2]} color="#06b6d4" size={0.6} />
                <AnimatedOrb position={[4, -2, -1]} color="#8b5cf6" size={0.8} />
                <AnimatedOrb position={[2, 3, -3]} color="#3b82f6" size={0.4} />

                <Particles count={200} />

                <Environment preset="city" />
            </Canvas>
        </div>
    );
}
