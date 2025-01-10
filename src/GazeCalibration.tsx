import React, { useState, useEffect } from 'react';
import './GazeCalibration.css';
import { MainContent } from './MainContent';

// スクリーンの幅・高さ
let screenMyWidth = window.innerWidth;
let screenMyHeight = window.innerHeight;

const GazeCalibration = () => {
  const [calibrationPoints, setCalibrationPoints] = useState([
    { x: 100, y: 100 },
    { x: screenMyWidth / 2, y: 100 },
    { x: screenMyWidth - 100, y: 100 },
    { x: 100, y: screenMyHeight / 2 },
    { x: screenMyWidth / 2, y: screenMyHeight / 2 },
    { x: screenMyWidth - 100, y: screenMyHeight / 2 },
    { x: 100, y: screenMyHeight - 100 },
    { x: screenMyWidth / 2, y: screenMyHeight - 100 },
    { x: screenMyWidth - 100, y: screenMyHeight - 100 },
  ]); // 9点キャリブレーション

  const [isCalibrationStarted, setIsCalibrationStarted] = useState(false);  // キャリブレーションを開始したかどうか

  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [calibrationCount, setCalibrationCount] = useState(1);  // キャリブレーション回数
  const calibrationCountMax = 3;  // キャリブレーション回数
  const [isCalibrated, setIsCalibrated] = useState(false);

  const [isInConferenceRoom, setIsInConferenceRoom] = useState(false);  // 会議室にいるかどうか

  // WebGazer.jsを用いた視線キャリブレーション
  const onCallibrationStart = () => {
    // スクリプトを動的に挿入
    const script = document.createElement('script');
    script.src = 'https://webgazer.cs.brown.edu/webgazer.js';
    script.async = true;
    document.body.appendChild(script);

    // スクリプトのロード完了後に処理を実行
    script.onload = () => {
      const webgazer = (window as any).webgazer;
      if (webgazer) {
        // WebGazerの初期化
        webgazer
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        // .setGazeListener((data: any, timestamp: number) => {
        //   if (data) {
        //     // eslint-disable-next-line
        //     console.log(`X: ${data.x}, Y: ${data.y}`);
        //   }
        // })
        .begin().then(() => console.log('WebGazer started'));
      }
    };

    setTimeout(() => setIsCalibrationStarted(true), 5000); // 5秒後にキャリブレーション開始

    // クリーンアップ: コンポーネントのアンマウント時にスクリプトを削除
    return () => {
      document.body.removeChild(script);
      const webgazer = (window as any).webgazer;
      if (webgazer) {
        webgazer.end();
      }
    };
  }

  const handleCalibration = async () => {
    const currentPoint = calibrationPoints[currentPointIndex];
    if (currentPoint) {
      // 現在のキャリブレーションポイントでデータを記録
      // eslint-disable-next-line
      console.log(`Calibrating at: x=${currentPoint.x}, y=${currentPoint.y}`);
      await (window as any).webgazer.recordScreenPosition(currentPoint.x, currentPoint.y);

      // eslint-disable-next-line
      console.log(`Calibration count: ${calibrationCount}`);

      if (calibrationCount % calibrationCountMax === 0) {
        // 次のポイントへ移動
        if (currentPointIndex < calibrationPoints.length - 1) {
          setCurrentPointIndex(currentPointIndex + 1);
        } else {
          setIsCalibrated(true); // キャリブレーション完了
        }
      }

      setCalibrationCount(calibrationCount + 1);
    }
  };

  const onRecalibration = () => {
    setCurrentPointIndex(0);
    setIsCalibrated(false);
    const webgazer = (window as any).webgazer;
    // WebGazerの初期化
    if (webgazer) {
      webgazer.end();
      webgazer.begin().then(() => console.log('WebGazer started'));
    }
  };

  const onMoveConferenceRoom = () => {
    // WebGazerの赤い点を非表示にする
    const webgazer = (window as any).webgazer;
    if (webgazer) {
      webgazer.showPredictionPoints(false);
    }

    // eslint-disable-next-line
    console.log('Move to Conference Room');
    setIsInConferenceRoom(true);  // 会議室に移動
  };

  useEffect(() => {
    if (isCalibrationStarted && !isCalibrated) {
      if (currentPointIndex < calibrationPoints.length) {
        const timer = setTimeout(handleCalibration, 1000); // 各ポイントで3秒間注視
        return () => clearTimeout(timer);
      }
    }
  }, [calibrationCount, currentPointIndex, isCalibrationStarted]);

  return (
    <div>
      {!isCalibrationStarted ? (
        <>
          <button onClick={onCallibrationStart}>GazeCalibration Start</button>
        </>
      ) : (
        <>
          {!isCalibrated ? (
            <>
              <p>Look at the red dot to calibrate your gaze.</p>
              {calibrationPoints.map((point, index) => (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    left: `${point.x}px`,
                    top: `${point.y}px`,
                    width: '20px',
                    height: '20px',
                    backgroundColor: currentPointIndex === index ? 'red' : 'gray',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </>
          ) : (
            <>
              {!isInConferenceRoom ? (
                <>
                  <p>Calibration Complete! You can now use gaze tracking.</p>
                  <button onClick={onMoveConferenceRoom}>Go to Conference Room</button>
                  {/* <button onClick={onRecalibration}>Recalibration</button> */}
                </>
              ) : (
                <MainContent />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default GazeCalibration;
