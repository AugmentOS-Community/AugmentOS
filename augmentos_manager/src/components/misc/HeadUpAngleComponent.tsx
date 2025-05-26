import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  PanResponder,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

interface HeadUpAngleArcModalProps {
  visible: boolean;
  initialAngle: number;
  maxAngle?: number;
  onCancel: () => void;
  onSave: (angle: number) => void;
}

const deg2rad = (deg: number) => (Math.PI / 180) * deg;

const pointOnCircle = (
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } => {
  const angleRad = deg2rad(angleDeg);
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy - r * Math.sin(angleRad),
  };
};

const describeArc = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string => {
  const start = pointOnCircle(cx, cy, r, startAngle);
  const end = pointOnCircle(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
  ].join(' ');
};

const HeadUpAngleArcModal: React.FC<HeadUpAngleArcModalProps> = ({
  visible,
  initialAngle,
  maxAngle = 60,
  onCancel,
  onSave,
}) => {
  const [angle, setAngle] = useState<number>(initialAngle);
  const svgSize = 500;
  const radius = 300;
  const cx = svgSize / 5;
  const cy = svgSize / 1.2;
  const startAngle = 0;

  const computeAngleFromTouch = (x: number, y: number): number => {
    const dx = x - cx;
    const dy = cy - y;
    let theta = Math.atan2(dy, dx) * (180 / Math.PI);
    if (theta < 0) {theta = 0;}
    theta = Math.max(0, Math.min(theta, maxAngle));
    return theta;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const newAngle = computeAngleFromTouch(
          evt.nativeEvent.locationX,
          evt.nativeEvent.locationY
        );
        setAngle(newAngle);
      },
      onPanResponderMove: (evt) => {
        const newAngle = computeAngleFromTouch(
          evt.nativeEvent.locationX,
          evt.nativeEvent.locationY
        );
        setAngle(newAngle);
      },
    })
  ).current;

  const backgroundArcPath = describeArc(cx, cy, radius, startAngle, maxAngle);
  const currentArcPath = describeArc(cx, cy, radius, startAngle, angle);
  const knobPos = pointOnCircle(cx, cy, radius, angle);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Drag the slider to adjust your HeadUp angle.</Text>

          <View style={styles.svgWrapper} {...panResponder.panHandlers}>
            <Svg width={svgSize} height={svgSize}>
              <Path d={backgroundArcPath} stroke="#ddd" strokeWidth={7} fill="none" />
              <Path d={currentArcPath} stroke="#007AFF" strokeWidth={7} fill="none" />
              <Circle cx={knobPos.x} cy={knobPos.y} r={15} fill="#007AFF" />
            </Svg>
          </View>

          <Text style={styles.angleLabel}>{Math.round(angle)}°</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => onSave(Math.round(angle))}
            >
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default HeadUpAngleArcModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: 380,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  svgWrapper: {
    width: 400,
    height: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  angleLabel: {
    fontSize: 36,
    fontWeight: 'bold',
    marginVertical: 20,
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
  },
  cancelButton: {
    backgroundColor: '#888',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
