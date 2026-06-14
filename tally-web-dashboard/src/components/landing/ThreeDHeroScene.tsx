import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, PresentationControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

const FloatingCard = () => {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        meshRef.current.rotation.x = Math.cos(t / 4) / 10;
        meshRef.current.rotation.y = Math.sin(t / 4) / 10;
        meshRef.current.position.y = Math.sin(t / 2) / 8;
    });

    return (
        <group perspective={1000}>
            <mesh ref={meshRef} castShadow receiveShadow>
                <boxGeometry args={[4.5, 2.8, 0.1]} />
                <meshPhysicalMaterial
                    color="#ffffff"
                    metalness={0.1}
                    roughness={0.1}
                    transmission={0.6}
                    thickness={0.5}
                    ior={1.5}
                    opacity={0.3}
                    transparent
                    envMapIntensity={1}
                />

                {/* Header bar */}
                <mesh position={[0, 1.1, 0.051]}>
                    <planeGeometry args={[4, 0.15]} />
                    <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.5} transparent opacity={0.6} />
                </mesh>

                {/* Chart Mockups */}
                <mesh position={[-1.2, 0, 0.051]}>
                    <planeGeometry args={[1.5, 1.2]} />
                    <meshStandardMaterial color="#1a1a1a" transparent opacity={0.5} />
                </mesh>
                <mesh position={[1.2, 0.3, 0.051]}>
                    <planeGeometry args={[1.5, 0.6]} />
                    <meshStandardMaterial color="#1a1a1a" transparent opacity={0.5} />
                </mesh>

                {/* Animated progress bar mock */}
                <mesh position={[1.2, -0.3, 0.051]}>
                    <planeGeometry args={[1.5, 0.1]} />
                    <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={0.3} />
                </mesh>
            </mesh>
        </group>
    );
};

const TechShape = ({ position, rotation, color }: { position: [number, number, number], rotation: [number, number, number], color: string }) => {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        meshRef.current.rotation.x += 0.005;
        meshRef.current.rotation.y += 0.005;
        meshRef.current.position.y = position[1] + Math.sin(t + position[0]) * 0.2;
    });

    return (
        <mesh ref={meshRef} position={position} rotation={rotation}>
            <octahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial
                color={color}
                wireframe
                transparent
                opacity={0.4}
            />
        </mesh>
    );
};

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
        <div className="absolute inset-0 z-0 bg-[#020617]">
            <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 0, 8], fov: 45 }}>
                <fog attach="fog" args={['#020617', 5, 15]} />

                <ambientLight intensity={0.4} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} color="#06b6d4" />
                <pointLight position={[0, -5, 5]} intensity={0.2} color="#8b5cf6" />

                <PresentationControls
                    global
                    config={{ mass: 2, tension: 500 }}
                    snap={{ mass: 4, tension: 1500 }}
                    rotation={[0, 0, 0]}
                    polar={[-Math.PI / 12, Math.PI / 12]}
                    azimuth={[-Math.PI / 6, Math.PI / 6]}
                >
                    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
                        <FloatingCard />
                    </Float>
                </PresentationControls>

                <TechShape position={[-4, 2, -2]} rotation={[Math.PI / 4, 0, 0]} color="#06b6d4" />
                <TechShape position={[4, -2, -1]} rotation={[0, Math.PI / 4, 0]} color="#8b5cf6" />
                <TechShape position={[2, 3, -4]} rotation={[Math.PI / 2, Math.PI / 4, 0]} color="#3b82f6" />
                <TechShape position={[-3, -3, -2]} rotation={[Math.PI / 3, 0, Math.PI / 6]} color="#06b6d4" />

                <Particles count={96} />
                <Stars radius={60} depth={25} count={1200} factor={2} saturation={0} fade speed={0.4} />
            </Canvas>
        </div>
    );
}
