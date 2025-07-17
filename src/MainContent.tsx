// --- Import Statements ---
import { 
  LocalAudioStream, LocalDataStream, LocalRoomMember, LocalStream, LocalVideoStream,
  RemoteDataStream, RoomPublication,
  SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory,
  nowInSec, uuidV4
} from "@skyway-sdk/room";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RemoteMedia } from "./RemoteMedia";
import "./MainContent.css"
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera } from "@mediapipe/camera_utils";
import Webcam from "react-webcam";
import { CSVLink } from "react-csv";
import SpeechRecognition, {  useSpeechRecognition } from 'react-speech-recognition';

// --- Constant Valuale ---
const AppConstants = {
  MOVING_AVERAGE_FRAME: 10,  // 移動平均計算時のフレーム数
  WIDTH_MAX: 1000,  // ビデオウィンドウの大きさの最大値
  WIDTH_MIN: 800,  // ビデオウィンドウの大きさの最小値
  DISTANCE_RATE_MOVE: 10000,  // 位置の移動を行う場合の，スクリーンの中心からのずれの拡大率
  DEFAULT_TOP_DIFF: 0,  // 位置の移動を行う場合の，スクリーンの中心からの上下方向のずれ
  DEFAULT_LEFT_DIFF: 0,  // 位置の移動を行う場合の，スクリーンの中心からの左右方向のずれ
  BORDER_ALPHA_MIN: 0,  // ビデオウィンドウの枠の色の透明度の最小値
  BORDER_ALPHA_MAX: 1,  // ビデオウィンドウの枠の色の透明度の最大値
  BORDER_ALPHA_MIN_THRESHOLD: 0.015,  // ビデオウィンドウの枠の色を完全に透明にする時の閾値
  DEFAULT_MY_WINDOW_WIDTH: 250,  // 自分自身のビデオウィンドウの大きさのデフォルト値
  VOLUME_THRESHOLD: 10,  // 発話と判定するボリュームの閾値（0-255，要調整）
  SPEAKING_DEBOUNCE_MS: 200,  // 発話開始/終了の判定を安定させるためのデバウンス時間
  BORDER_COLORS: {
    GREEN: { r: 83, g: 253, b: 49, a: 0 },  // ビデオウィンドウの枠の色（緑色）
    BLACK: { r: 0, g: 0, b: 0, a: 0 },  // ビデオウィンドウの枠の色（黒色）
    RED: { r: 255, g: 0, b: 0, a: 0 },  // ビデオウィンドウの枠の色（赤色）
  },
};
const defaultWidth = (AppConstants.WIDTH_MAX + AppConstants.WIDTH_MIN) / 2;  // ビデオウィンドウの大きさのデフォルト値（参加者・対話相手共通）
const defaultBorderColor = AppConstants.BORDER_COLORS.GREEN;  // ビデオウィンドウの枠の色のデフォルト値（参加者・対話相手共通）

// --- Interfaces ---
export interface WindowAndAudioAndParticipantsInfo {
    topDiff: number;  // 位置を移動させる場合の上下方向の変化量
    leftDiff: number;  // 位置を移動させる場合の左右方向の変化量
    width: number;
    height: number;  // heightはwidthのHeightPerWidthRate倍
    borderRed: number;  // ビデオウィンドウの枠の色（赤）の値
    borderGreen: number;  // ビデオウィンドウの枠の色（緑）の値
    borderBlue: number;  // ビデオウィンドウの枠の色（青）の値
    borderAlpha: number;  // ビデオウィンドウの枠の色の透明度の値
    borderAlphaValueBasedVoice: number;  // 発話タイミングに基づく，枠の色の透明度変化を表す値（自分自身用）
    theta: number;  // 頭部方向（度）
    widthInCaseOfChange: number;  // ビデオウィンドウの大きさを変更した場合の大きさ
    isSpeaking: boolean;  // 発言者か否か
    transcript: string;  // 発言内容
    gazeStatus: string; // 参加者の状態（注視状態 or 視線回避状態 or ノーマル）
}  // ビデオウィンドウの情報
interface CSV_HeadDirection_Info {
  ID: number;
  condition: number;
  startTime: number;
  endTime: number;
  myTheta: number;
  myDirection: string;
  myWindowWidth: number;
  myStatusGaze: string;
  myIsSpeaking: boolean;
  myTranscript: string;
  [key: string]: any;  // インデックスシグネチャを追加して動的なプロパティを許可
  // otherTheta: number;
  // otherDirection: string;
  // otherWindowWidth: number;
  // otherStatusGaze: string;
  // otherIsSpeaking: boolean;
  // otherTranscript: string;
}  // CSVファイルに書き出す頭部方向の情報

// --- Utility Functions ---
const Utils = {
  // 数値型リストの要素の平均値を求める関数
  averageValue: (numberList: number[], startId: number = 0, endId: number = numberList.length - 1) => {
    let sum = 0;  // 引数のリスト内の要素の合計値
    for (let i = startId; i < endId + 1; i++) {
      sum += numberList[i];
    }
    return sum / (endId - startId + 1);
  },
  // 2つのベクトル（数値型リスト）の内積を求める関数
  inner: (numberList1: number[], numberList2: number[]) => {
    return numberList1[0] * numberList2[0] + numberList1[1] * numberList2[1];
  },
  // ベクトル（数値型リスト）の長さを求める関数
  norm: (numberList: number[]) => {
    return Math.sqrt(numberList[0] * numberList[0] + numberList[1] * numberList[1]);
  },
  // 参加者の視線方向を求める関数
  getParticipantDirection: (theta: number) => {
    if (theta < 0 || theta > 360) return "Error";

    // 参加者の視線方向を識別
    if (theta < 22.5 || theta >= 337.5) return "Left";
    else if (theta >= 22.5 && theta < 67.5) return "LeftDown";
    else if (theta >= 67.5 && theta < 112.5) return "Down";
    else if (theta >= 112.5 && theta < 157.5) return "RightDown";
    else if (theta >= 157.5 && theta < 202.5) return "Right";
    else if (theta >= 202.5 && theta < 247.5) return "RightUp";
    else if (theta >= 247.5 && theta < 292.5) return "Up";
    else if (theta >= 292.5 && theta < 337.5) return "LeftUp";
    else return "Error";
  }
}

// --- Global Variables（以下すべてuseStateで管理したいが，やり方が分かっていないので，保留） ---
let participantID = 1;  // 参加者ID
let conditionID = 1;  // 条件番号・条件名
let conditionName = "Baseline";  // 条件名
let startTime = 0;  // 計測開始時間
let moveWidths: number[] = [];  // ビデオウィンドウの大きさの移動平均を計算するためのリスト
let moveBorderAlphas: number[] = [];  // ビデオウィンドウの枠の色の透明度の移動平均を計算するためのリスト
// let isSpeaking = false;  // 発話状態か否か
// let borderAlphaValueBasedVoice = AppConstants.BORDER_ALPHA_MIN;  // 発話タイミングに基づく，枠の色の透明度変化を表す値

// --- Component Logic ---
export const MainContent = () => {
  // --- States ---
  const [ me, setMe ] = useState<LocalRoomMember>();  // 自分自身の参加者情報
  const [ roomName, setRoomName ] = useState("");  // ルーム名
  const [ localStream, setLocalStream ] = useState<{
    audio: LocalAudioStream;
    video: LocalVideoStream;
  }>();  // ローカルストリーム
  const [ localDataStream, setLocalDataStream ] = useState<LocalDataStream>();  // ローカル側のデータストリーム
  const [ otherUserDataStreams, setOtherUserDataStreams ] = useState<Map<string, RemoteDataStream>>( new Map() );  // リモート側のデータストリーム
  const [ otherUserPublications, setOtherUserPublications ] = useState<Map<string, RoomPublication<LocalStream>>>( new Map() );  // 会話相手の公開ストリーム
  const [ devices, setDevices ] = React.useState<MediaDeviceInfo[]>([]);
  const [ isSpeaking, setIsSpeaking ] = useState(false);
  const [ borderAlphaValueBasedVoice, setBorderAlphaValueBasedVoice ] = useState(AppConstants.BORDER_ALPHA_MIN);
  const [ myWindowAndAudioAndParticipantsInfo, setMyWindowAndAudioAndParticipantsInfo ] = useState<WindowAndAudioAndParticipantsInfo>({ 
    topDiff: AppConstants.DEFAULT_TOP_DIFF, leftDiff: AppConstants.DEFAULT_LEFT_DIFF, 
    width: defaultWidth, height: defaultWidth,
    borderRed: defaultBorderColor.r, borderGreen: defaultBorderColor.g, borderBlue: defaultBorderColor.b, 
    borderAlpha: defaultBorderColor.a, borderAlphaValueBasedVoice: borderAlphaValueBasedVoice,
    widthInCaseOfChange: 0, theta: 0, isSpeaking: false, transcript: "", gazeStatus: ""
  });  // 自分自身のウィンドウの情報
  // const [ otherUserWindowAndAudioAndParticipantsInfo, setOtherUserWindowAndAudioAndParticipantsInfo ] = useState<WindowAndAudioAndParticipantsInfo>({
  //   topDiff: AppConstants.DEFAULT_TOP_DIFF, leftDiff: AppConstants.DEFAULT_LEFT_DIFF, 
  //   width: defaultWidth, height: defaultWidth,
  //   borderRed: defaultBorderColor.r, borderGreen: defaultBorderColor.g, borderBlue: defaultBorderColor.b, 
  //   borderAlpha: defaultBorderColor.a, borderAlphaValueBasedVoice: borderAlphaValueBasedVoice,
  //   widthInCaseOfChange: 0, theta: 0, isSpeaking: false, transcript: "", gazeStatus: ""
  // });  // 会話相手のウィンドウの情報
  const { 
    transcript,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();  // 音声認識設定
  const [ headDirectionResults, setHeadDirectionResults ] = useState<CSV_HeadDirection_Info[]>([]);  // 収集データ
  const [ startTime_HeadDirection, setStartTime_HeadDirection ] = useState<number>(0);  // ウィンドウ情報収集開始時間
  const [ nowTest, setNowTest ] = useState<boolean>(false);  // ウィンドウ情報収集中か否か

  // --- Refs ---
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const audtioInputGainNodeRef = useRef<GainNode | null>(null);  // オプション: マイク入力のゲイン調整用
  const webcamRef = useRef<Webcam>(null);  // Webcamの参照
  const resultsRef = useRef<Results>();  // MediaPipeの検出結果を格納するための参照
  const CSVRef = useRef<CSVLink & HTMLAnchorElement & { link: HTMLAnchorElement }>(null);  // CSVファイルのリンクを格納するための参照

  // --- Memos ---
  const appId = useMemo(() => process.env.REACT_APP_SKYWAY_APP_ID, []);  // SkyWayのアプリID
  const secretKey = useMemo(() => process.env.REACT_APP_SKYWAY_SECRET_KEY, []);  // SkyWayのシークレットキー
  const token = useMemo(() => {
    if (appId == null || secretKey == null) return undefined;

    return new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      scope: {
        app: {
          id: appId,
          turn: true,
          actions: ["read"],
          channels: [
            {
              id: "*",
              name: "*",
              actions: ["write"],
              members: [
                {
                  id: "*",
                  name: "*",
                  actions: ["write"],
                  publication: {
                    actions: ["write"],
                  },
                  subscription: {
                    actions: ["write"],
                  },
                },
              ],
              sfuBots: [
                {
                  actions: ["write"],
                  forwardings: [
                    {
                      actions: ["write"],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }).encode(secretKey);
  }, [appId, secretKey]);  // SkyWayの認証トークン
  const myWindowAndAudioContainerStyle = useMemo<React.CSSProperties>(() => ({
    position: "absolute",
    top: 0,
    left: 0,  // 右上の場合：0（右下の場合：window.innerWidth - AppConstants.DEFAULT_MY_WINDOW_WIDTH - 20）
    width: AppConstants.DEFAULT_MY_WINDOW_WIDTH,
    border: `10px solid rgba(${myWindowAndAudioAndParticipantsInfo.borderRed}, ${myWindowAndAudioAndParticipantsInfo.borderGreen}, ${myWindowAndAudioAndParticipantsInfo.borderBlue}, ${myWindowAndAudioAndParticipantsInfo.borderAlphaValueBasedVoice})`,
  }), [ myWindowAndAudioAndParticipantsInfo ]);  // 参加者側のビデオウィンドウのスタイル
  // const otherUserWindowAndAudioContainerStyle = useMemo<React.CSSProperties>(() => ({
  //   position: "absolute",
  //   top: // 画面の上側にはみ出る場合には，画面上端に位置調整
  //        0 + window.screen.height / 2 - otherUserWindowAndAudioAndParticipantsInfo.height / 2 + otherUserWindowAndAudioAndParticipantsInfo.topDiff < 0 ? 0 :
  //        // 画面の下側にはみ出る場合には，画面下端に位置調整
  //        0 + window.screen.height / 2 - otherUserWindowAndAudioAndParticipantsInfo.height / 2 + otherUserWindowAndAudioAndParticipantsInfo.topDiff 
  //        > 0 + window.screen.height - otherUserWindowAndAudioAndParticipantsInfo.height ? 0 + window.screen.height - otherUserWindowAndAudioAndParticipantsInfo.height :
  //        // 画面内に収まるなら，その位置に配置
  //        0 + window.screen.height / 2 - otherUserWindowAndAudioAndParticipantsInfo.height / 2 + otherUserWindowAndAudioAndParticipantsInfo.topDiff,
  //   left: // 画面の左側にはみ出る場合には，画面左端に位置調整
  //         window.screenLeft + scrollMyX + window.screen.width / 2 - otherUserWindowAndAudioAndParticipantsInfo.width / 2 + otherUserWindowAndAudioAndParticipantsInfo.leftDiff < 0 ? 0 :
  //         window.screenLeft + scrollMyX + window.screen.width / 2 - otherUserWindowAndAudioAndParticipantsInfo.width / 2 + otherUserWindowAndAudioAndParticipantsInfo.leftDiff
  //         > window.screenLeft + scrollMyX + window.screen.width - otherUserWindowAndAudioAndParticipantsInfo.width ? window.screenLeft + scrollMyX + window.screen.width - otherUserWindowAndAudioAndParticipantsInfo.width : 
  //         window.screenLeft + scrollMyX + window.screen.width / 2 - otherUserWindowAndAudioAndParticipantsInfo.width / 2 + otherUserWindowAndAudioAndParticipantsInfo.leftDiff,
  //   width: otherUserWindowAndAudioAndParticipantsInfo.width,
  //   border: `10px solid rgba(${otherUserWindowAndAudioAndParticipantsInfo.borderRed}, ${otherUserWindowAndAudioAndParticipantsInfo.borderGreen}, ${otherUserWindowAndAudioAndParticipantsInfo.borderBlue}, ${otherUserWindowAndAudioAndParticipantsInfo.borderAlpha})`
  // }), [ otherUserWindowAndAudioAndParticipantsInfo ]);  // 会話相手側のビデオウィンドウのスタイル
  const canJoin = useMemo(() => {
    return (
      participantID !== -1 && 
      conditionID !== -1 && 
      roomName !== "" && 
      localStream != null && 
      me == null
    );
  }, [ participantID, conditionID, roomName, localStream, me ]);  // ルームに入ることができるか否か

  // --- Callbacks ---
  const onJoinClick = useCallback(async () => {
    // canJoinまでにチェックされるので，普通は起きない
    // assertionメソッドにしてもいい
    if (localStream == null || token == null) {
      console.error("ローカルストリームまたはトークンが設定されていません。");
      return;
    }

    try {
      // ルームを取得、または新規作成
      const context = await SkyWayContext.Create(token);
      const room = await SkyWayRoom.FindOrCreate(context, {
        type: 'sfu',  // 3人以上の会議用に，p2p → sfuに変更
        name: roomName,
      });
      const me = await room.join();
      setMe(me);

      // 映像と音声を配信
      await me.publish(localStream.video);
      await me.publish(localStream.audio);
      if (localDataStream !== undefined) {
        // eslint-disable-next-line
        console.log("published data stream");  // デバッグ用
        await me.publish(localDataStream);
      }

      // 既存の参加者情報をすべて取得
      const otherPublifications = new Map<string, RoomPublication<LocalStream>>();
      for (const publication of room.publications) {
        if (publication.publisher.id !== me.id) {
          otherPublifications.set(publication.publisher.id, publication);
          if (publication.contentType === "data") {
            const { stream } = await me.subscribe(publication.id);
            if (stream.contentType === "data") {
              setOtherUserDataStreams(prev => new Map(prev).set(publication.publisher.id, stream as RemoteDataStream));
            }
          }
        }
      }

      // その後に参加してきた人の情報を取得
      room.onStreamPublished.add(async (e) => {
        if (e.publication.publisher.id !== me.id) {
          setOtherUserPublications(prev => new Map(prev).set(e.publication.publisher.id, e.publication));
          if (e.publication.contentType === "data") {
            const { stream } = await me.subscribe(e.publication.id);
            if (stream.contentType === "data") {
              setOtherUserDataStreams(prev => new Map(prev).set(e.publication.publisher.id, stream as RemoteDataStream));
              // eslint-disable-next-line
              console.log(`${e.publication.id}のDataStreamにセットしました！`);
            }
          }
        }
      });

      // 既存の参加者情報をすべて取得
      // const otherPublifications = room.publications.filter(p => p.publisher.id !== me.id);
      // setOtherUserPublications(otherPublifications);
      // for (let i = 0; i < otherPublifications.length; i++) {
      //   if (otherPublifications[i].contentType === "data") {
      //     const { stream } = await me.subscribe(otherPublifications[i].id);
      //     if (stream.contentType === "data") {
      //       setOtherUserDataStreams(stream);
      //     }
      //   }
      // }

      // その後に参加してきた人の情報を取得
      // room.onStreamPublished.add(async (e) => {
      //   if (e.publication.publisher.id !== me.id) {
      //     setOtherUserPublications(pre => [ ...pre, e.publication ]);
      //   }

      //   if (e.publication.contentType === "data" && e.publication.publisher.id !== me.id) {
      //     const { stream } = await me.subscribe(e.publication.id);
      //     if (stream.contentType === "data") {
      //       setOtherUserDataStreams(stream);
      //       // eslint-disable-next-line
      //       console.log("DataStreamにセットしました！");  // デバッグ用
      //     }  // ここは必ずRemoteDataStreamになるはず
      //   }
      // });

      // 参加者退室時の処理
      room.onMemberLeft.add((e) => {
        // eslint-disable-next-line
        console.log(`${e.member.id}が退室しました`);
        setOtherUserPublications(prev => {
          const newMap = new Map(prev);
          newMap.delete(e.member.id);
          return newMap;
        });
        setOtherUserDataStreams(prev => {
          const newMap = new Map(prev);
          newMap.delete(e.member.id);
          return newMap;
        });
      });

      // 部屋名のみを表示させる
      document.getElementById("active-after-conference")?.classList.remove("non-active");
      document.getElementById("active-before-conference")?.classList.add("non-active");

    } catch (error) {
      // エラー処理
      console.error("ルームへの参加に失敗しました:", error);
    }

  }, [ roomName, token, localStream, localDataStream ]);  // オンライン会議を立ち上げ
  const startAudioLevelMonitoring = useCallback(() => {
    const analyser = analyserNodeRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyser || !dataArray) return;

    let speakingTimer: NodeJS.Timeout | null = null;
    let notSpeakingTimer: NodeJS.Timeout | null = null;

    const checkAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);

      // eslint-disable-next-line
      // console.log("Audio Data Array: " + dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      
      const averageVolume = sum / dataArray.length;  // 音量平均
      // eslint-disable-next-line
      // console.log("音量平均： ", averageVolume);

      if (averageVolume > AppConstants.VOLUME_THRESHOLD) {
        // eslint-disable-next-line
        // console.log("isSpeaking（発話開始）: ", isSpeaking);  // デバッグ用
        // ボリュームが閾値を超えた場合
        if (speakingTimer === null) {
          speakingTimer = setTimeout(() => {
            // 発話開始のロジック
            setIsSpeaking(true);
            setBorderAlphaValueBasedVoice(AppConstants.BORDER_ALPHA_MAX);  // 枠の色をつける
            SpeechRecognition.startListening({
              continuous: false, // 連続認識を無効にする
              language: 'ja'
            });
            speakingTimer = null;
          }, AppConstants.SPEAKING_DEBOUNCE_MS);
        }
        if (notSpeakingTimer) {
          clearTimeout(notSpeakingTimer);
          notSpeakingTimer = null;
        }
      }
      else {
        // eslint-disable-next-line
        // console.log("isSpeaking（発話終了）: ", isSpeaking);  // デバッグ用
        // ボリュームが閾値を下回った場合
        if (notSpeakingTimer === null) {
          notSpeakingTimer = setTimeout(() => {
            // 発話終了のロジック
            setIsSpeaking(false);
            setBorderAlphaValueBasedVoice(AppConstants.BORDER_ALPHA_MIN);  // 枠の色を透明にする
            SpeechRecognition.stopListening();
            resetTranscript(); // 次の発話のためにトランスクリプトをリセット
            notSpeakingTimer = null;
          }, AppConstants.SPEAKING_DEBOUNCE_MS);
        }
        if (speakingTimer) {
          clearTimeout(speakingTimer);
          speakingTimer = null;
        }
      }

      // 次のフレームで再度チェック
      requestAnimationFrame(checkAudioLevel);
    };

    requestAnimationFrame(checkAudioLevel);
  }, [ isSpeaking, resetTranscript ]);  // 音声レベルの監視
  // ビデオウィンドウのInfoの更新+音声データの追加
  const updateWindowInfo = useCallback(
    (
      conditionID: number, 
      fc_d_from_fc_vector: number[], rad_head_direction: number, theta_head_direction: number, 
      borderAlphaValueBasedVoice: number, status: boolean, text: string
    ): WindowAndAudioAndParticipantsInfo => {
      //  --- Variables ---
      let next_width_rate = 0;  // ウィンドウの大きさの最大値に対する，実際のウィンドウの大きさの比率
      let next_border_a_rate = 0;  // ビデオウィンドウの枠の色の透明度の比率
      let width_value = defaultWidth;  // ビデオウィンドウの大きさ
      let border_a_value = AppConstants.BORDER_ALPHA_MIN;  // ビデオウィンドウの枠の色の透明度
      let myWindowWidthTmpValue = 0;  // ビデオウィンドウの大きさ（保存・分析用）
      let width_value_discrete = AppConstants.WIDTH_MIN;  // 離散変化時のビデオウィンドウの大きさ
      let gazeStatus = "";  // 参加者の視線状態（注視状態 or 視線回避状態）
      let top_diff_value = AppConstants.DISTANCE_RATE_MOVE * Utils.norm(fc_d_from_fc_vector) * Math.sin(rad_head_direction);  // スクリーンの中心からの上下方向のずれ
      let left_diff_value = AppConstants.DISTANCE_RATE_MOVE * Utils.norm(fc_d_from_fc_vector) * Math.cos(rad_head_direction - Math.PI);  // スクリーンの中心からの左右方向のずれ
      let newInfo: WindowAndAudioAndParticipantsInfo;  // ビデオウィンドウの情報をまとめたデータ

      // ウィンドウの大きさ・ビデオウィンドウの枠の色の透明度の計算
      if (150 * Utils.norm(fc_d_from_fc_vector) <= 1) {
        next_width_rate = 1;
        next_border_a_rate = 1;
      }
      else {
        next_width_rate = 1 / (150 * Utils.norm(fc_d_from_fc_vector));
        next_border_a_rate = 1 / (150 * Utils.norm(fc_d_from_fc_vector));
      }
      width_value = AppConstants.WIDTH_MAX * next_width_rate;
      border_a_value = AppConstants.BORDER_ALPHA_MAX * next_border_a_rate;

      // ウィンドウの大きさ・ビデオウィンドウの枠の色の透明度が最小値を下回らないようにする
      if (width_value < AppConstants.WIDTH_MIN) width_value = AppConstants.WIDTH_MIN;
      if (border_a_value < AppConstants.BORDER_ALPHA_MIN_THRESHOLD) border_a_value = AppConstants.BORDER_ALPHA_MIN;

      myWindowWidthTmpValue = width_value;  // ウィンドウサイズの一時保存（大きさを変更しない条件でも分析できるようにするため）

      // 移動平均の計算 + リストの肥大化の防止（ビデオウィンドウの大きさ・ビデオウィンドウの枠の色の透明度）
      moveWidths.push(width_value);
      moveBorderAlphas.push(border_a_value);
      if (moveWidths.length < AppConstants.MOVING_AVERAGE_FRAME) width_value = Utils.averageValue(moveWidths, 0, moveWidths.length - 1);
      else{
        if (moveWidths.length > AppConstants.MOVING_AVERAGE_FRAME + 3) moveWidths.shift();
        width_value = Utils.averageValue(moveWidths, moveWidths.length - AppConstants.MOVING_AVERAGE_FRAME, moveWidths.length - 1);
      }
      if (moveBorderAlphas.length < AppConstants.MOVING_AVERAGE_FRAME) border_a_value = Utils.averageValue(moveBorderAlphas, 0, moveBorderAlphas.length - 1);
      else{
        if (moveBorderAlphas.length > AppConstants.MOVING_AVERAGE_FRAME + 3) moveBorderAlphas.shift();
        border_a_value = Utils.averageValue(moveBorderAlphas, moveBorderAlphas.length - AppConstants.MOVING_AVERAGE_FRAME, moveBorderAlphas.length - 1);
      }

      // 離散変化時のビデオウィンドウの大きさの計算
      if (width_value > AppConstants.WIDTH_MAX - (AppConstants.WIDTH_MAX - AppConstants.WIDTH_MIN) * 0.1) {
        width_value_discrete = AppConstants.WIDTH_MAX;  // 最大サイズ
      }
      else width_value_discrete = AppConstants.WIDTH_MIN;  // 最小サイズ

      // 参加者の視線状態（注視状態 or 視線回避状態）の算出
      if (myWindowWidthTmpValue > AppConstants.WIDTH_MAX - (AppConstants.WIDTH_MAX - AppConstants.WIDTH_MIN) * 0.1) {
        gazeStatus = "mutual gaze";
      }  // ビデオウィンドウの大きさが最大値の10%以内の時には，注視状態であると判断する
      if (myWindowWidthTmpValue < AppConstants.WIDTH_MIN + (AppConstants.WIDTH_MAX - AppConstants.WIDTH_MIN) * 0.1) {
        gazeStatus = "gaze aversion";
      }  // ビデオウィンドウの大きさが最小値の10%以内の時には，視線回避状態であると判断する

      // ビデオウィンドウの情報をまとめたデータの作成
      const baseInfo = {
        borderRed: defaultBorderColor.r,
        borderGreen: defaultBorderColor.g,
        borderBlue: defaultBorderColor.b,
        borderAlphaValueBasedVoice: borderAlphaValueBasedVoice,
        widthInCaseOfChange: myWindowWidthTmpValue,
        theta: theta_head_direction,
        isSpeaking: status,
        transcript: text,
        gazeStatus: gazeStatus
      }  // ビデオウィンドウの情報のベースデータ

      switch(conditionID) {
        case 1:  // Baseline条件
          newInfo = {
            ...baseInfo,
            topDiff: AppConstants.DEFAULT_TOP_DIFF,
            leftDiff: AppConstants.DEFAULT_LEFT_DIFF,
            width: defaultWidth,
            height: defaultWidth,
            borderAlpha: borderAlphaValueBasedVoice,
          };
          break;
        case 2:  // FrameChange条件
          newInfo = {
            ...baseInfo,
            topDiff: AppConstants.DEFAULT_TOP_DIFF,
            leftDiff: AppConstants.DEFAULT_LEFT_DIFF,
            width: defaultWidth,
            height: defaultWidth,
            borderAlpha: border_a_value,
          }
          break;
        case 3:  // SizeChange条件
          newInfo = {
            ...baseInfo,
            topDiff: AppConstants.DEFAULT_TOP_DIFF,
            leftDiff: AppConstants.DEFAULT_LEFT_DIFF,
            width: width_value,
            height: width_value,
            borderAlpha: borderAlphaValueBasedVoice,
          };
          break;
        case 4:  // SizeChange_Discrete条件
          newInfo = {
            ...baseInfo,
            topDiff: AppConstants.DEFAULT_TOP_DIFF,
            leftDiff: AppConstants.DEFAULT_LEFT_DIFF,
            width: width_value_discrete,
            height: width_value_discrete,
            borderAlpha: borderAlphaValueBasedVoice,
          };
          break;
        case 5:  // PositionChange条件
          newInfo = {
            ...baseInfo,
            topDiff: top_diff_value,
            leftDiff: left_diff_value,
            width: defaultWidth,
            height: defaultWidth,
            borderAlpha: borderAlphaValueBasedVoice,
          };
          break;
        case 6:  // PositionAndSizeChange条件
          newInfo = {
            ...baseInfo,
            topDiff: top_diff_value,
            leftDiff: left_diff_value,
            width: width_value,
            height: width_value,
            borderAlpha: borderAlphaValueBasedVoice,
          };
          break;
        default:  // Baseline条件
          newInfo = {
            ...baseInfo,
            topDiff: AppConstants.DEFAULT_TOP_DIFF,
            leftDiff: AppConstants.DEFAULT_LEFT_DIFF,
            width: defaultWidth,
            height: defaultWidth,
            borderAlpha: borderAlphaValueBasedVoice,
          };
      }

      return newInfo;  // ビデオウィンドウの情報を返す
    }, []
  );
  const onResults = useCallback((results: Results) => {
    // 顔の座標が正しく取得できている時のみ実行
    if (results.multiFaceLandmarks.length > 0) {
      // 検出結果の格納
      resultsRef.current = results;

      // 頭部方向の取得
      let landmarks_pos_x: number[] = []  // 468個の点のx座標を格納するリスト
      let landmarks_pos_y: number[] = []  // 468個の点のy座標を格納するリスト
      let face_center_default_pos: number[] = []  // 正面を向いた時の顔の中心点（ここでは，飯塚さんの修論に倣って，鼻の先の座標としている．）
      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        for (let id = 0; id < results.multiFaceLandmarks[0].length; id++) {
          // 特定の顔の点を取得（x座標）
          if (results.multiFaceLandmarks[0][id].x < 0) landmarks_pos_x.push(0);
          else if (results.multiFaceLandmarks[0][id].x > 1) landmarks_pos_x.push(1);
          else landmarks_pos_x.push(results.multiFaceLandmarks[0][id].x);

          // 特定の顔の点を取得（y座標）
          if (results.multiFaceLandmarks[0][id].y < 0) landmarks_pos_y.push(0);
          else if (results.multiFaceLandmarks[0][id].y > 1) landmarks_pos_y.push(1);
          else landmarks_pos_y.push(results.multiFaceLandmarks[0][id].y);

          // 正面を向いた時の顔の中心点を取得（x，y座標）
          if (id === 1) {
            // x座標
            if (results.multiFaceLandmarks[0][id].x < 0) face_center_default_pos.push(0);
            else if (results.multiFaceLandmarks[0][id].x > 1) face_center_default_pos.push(1);
            else face_center_default_pos.push(results.multiFaceLandmarks[0][id].x);

            // y座標
            if (results.multiFaceLandmarks[0][id].y < 0) face_center_default_pos.push(0);
            else if (results.multiFaceLandmarks[0][id].y > 1) face_center_default_pos.push(1);
            else face_center_default_pos.push(results.multiFaceLandmarks[0][id].y);
          }
        }
      }
      // 顔の中心点の座標
      const face_center_pos = [ Utils.averageValue(landmarks_pos_x), Utils.averageValue(landmarks_pos_y) ];
      const base_vector = [1,0];  // 頭部方向を計算するためのベクトル
      const fc_d_from_fc_vector = [face_center_default_pos[0] - face_center_pos[0], face_center_default_pos[1] - face_center_pos[1]];  // 顔の中心点を原点とした時の，正面を向いた際の顔の中心点のベクトル
      let rad_head_direction = Math.acos(Utils.inner(base_vector, fc_d_from_fc_vector) / (Utils.norm(base_vector) * Utils.norm(fc_d_from_fc_vector)));  // 頭部方向（ラジアン）
      let theta_head_direction = rad_head_direction * (180 / Math.PI);  // 頭部方向（度）
      // arccosの値域が0～πであるため，上下の区別をするために，上を向いている時には，ラジアンおよび度の値を更新する
      if (fc_d_from_fc_vector[1] < 0) {
        rad_head_direction = -rad_head_direction;
        theta_head_direction = 360 - theta_head_direction;
      }

      // 自分自身のビデオウィンドウの情報を更新
      setMyWindowAndAudioAndParticipantsInfo(pre => 
        updateWindowInfo(
          conditionID, 
          fc_d_from_fc_vector, 
          rad_head_direction, 
          theta_head_direction, 
          borderAlphaValueBasedVoice, 
          isSpeaking, isSpeaking ? transcript : ""
        )
      );
    }
  },[]);  // MediaPipeによる顔検出 & 頭部方向の計算  
  const testStart = useCallback(() => {
    // 頭部方向の書き出し開始
    setHeadDirectionResults([
      { ID: participantID, condition: conditionID, startTime: 0, endTime:0, 
        myTheta: 0, 
        myDirection: "", myWindowWidth: 0, myStatusGaze: "",
        myIsSpeaking: false, myTranscript: "",
        otherTheta: 0, 
        otherDirection: "", otherWindowWidth: 0, otherStatusGaze: "",
        otherIsSpeaking: false, otherTranscript: "" }
    ]);
    setStartTime_HeadDirection(0);
    startTime = performance.now();
    setNowTest(true);
  }, []);  // CSVファイルへのウィンドウ情報書き出し開始
  const testEnd = useCallback(() => {
    setNowTest(false);
    CSVRef?.current?.link.click();
  }, []);  // CSVファイルへのウィンドウ情報書き出し終了 & CSV保存

  // --- Effects ---
  useEffect(() => {
    const initialize = async () => {
      if (token == null || localVideoRef.current == null) return;

      // カメラの種類の選択
      navigator.mediaDevices.getUserMedia({
        video: {frameRate: 30}
      }).then((stream) => {
        // eslint-disable-next-line
        console.log(stream);  // デバッグ用
      }
      ).catch(console.error);
      // カメラ情報をセット
      const devices_tmp = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.label.includes("USB Camera"));
      setDevices(devices_tmp);

      if(localStream == null) {
        const stream = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        stream.video.attach(localVideoRef.current);
        setLocalStream(stream);

         // ここで音声トラックの詳細を確認
         const audioTrack = stream.audio.track;  // デバッグ用
         // eslint-disable-next-line
         console.log("Audio Track ID:", audioTrack.id);  // デバッグ用
         // eslint-disable-next-line
         console.log("Audio Track Muted:", audioTrack.muted);  // デバッグ用
         // eslint-disable-next-line
         console.log("Audio Track ReadyState:", audioTrack.readyState);  // デバッグ用
         // eslint-disable-next-line
         console.log("Audio Track Settings:", audioTrack.getSettings());  // デバッグ用

        // AudtioContextとAnalyserNodeの初期化
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

        // LocalAudioStream.trackから新しいMediaStreamを作成
        const audioMediaStream = new MediaStream([stream.audio.track]);

        // MediaStreamSourceとAnalyserNodeの作成
        const source = audioContextRef.current.createMediaStreamSource(audioMediaStream);
        analyserNodeRef.current = audioContextRef.current.createAnalyser();
        analyserNodeRef.current.fftSize = 2048;  // 音声データを分析するサンプル数
        dataArrayRef.current = new Uint8Array(analyserNodeRef.current.frequencyBinCount);

        // オプション：ゲインノードを追加して，マイク入力レベルを調整できるようにする
        audtioInputGainNodeRef.current = audioContextRef.current.createGain();
        audtioInputGainNodeRef.current.gain.value = 1.0;  // デフォルトゲイン

        // eslint-disable-next-line
        console.log("Source Tracks: ", audioMediaStream.getAudioTracks());

        // AudioNodeの接続
        source.connect(audtioInputGainNodeRef.current);
        audtioInputGainNodeRef.current.connect(analyserNodeRef.current);

        // eslint-disable-next-line
        console.log("Gain: ", audtioInputGainNodeRef.current.gain.value);  // デバッグ用
        console.log("AudioState: ", audioContextRef.current.state);  // デバッグ用

        // 音声レベル監視を開始
        startAudioLevelMonitoring();
      }

      const dataStream = await SkyWayStreamFactory.createDataStream();

      await localVideoRef.current.play();
      setLocalDataStream(dataStream);
    };
    
    initialize();  // 初期化
    // eslint-disable-next-line
    console.log("初期化されました！");  // デバッグ用

    return () => {
      // コンポーネントのアンマウント時にAudioContextを閉じる
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    }
  }, [ token, localVideoRef, localStream, startAudioLevelMonitoring ]);  // ビデオの初期設定（tokenとvideo要素の参照ができたら実行）
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      // eslint-disable-next-line
      console.error("ブラウザが音声認識をサポートしていません。");  // デバッグ用
    }
  }, [ browserSupportsSpeechRecognition ]);  // 音声認識のサポート状況の確認
  useEffect(() => {
    if (localDataStream != null) {
      localDataStream.write(myWindowAndAudioAndParticipantsInfo);
      // eslint-disable-next-line
      console.log("自分のデータを送信しました！");  // デバッグ用
    }
  }, [ myWindowAndAudioAndParticipantsInfo, localDataStream ]);  // 自分自身のウィンドウ情報の送信
  // useEffect(() => {
  //   if (otherUserDataStreams != null) {
  //     otherUserDataStreams.onData.add((args) => {
  //       setOtherUserWindowAndAudioAndParticipantsInfo(args as WindowAndAudioAndParticipantsInfo);
  //       // eslint-disable-next-line
  //       console.log("相手のデータを受信しました！");  // デバッグ用
  //     });
  //   }
  // }, [ otherUserDataStreams ]);  // 会話相手のウィンドウ情報の受信
  useEffect(() => {
    // MediaPipe側の初期設定
    const faceMesh = new FaceMesh({
      locateFile: file => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      }
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // landmarks 468 -> 478
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    faceMesh.onResults(onResults);

    // MediaPipeの顔検出用のカメラ検出
    if (localVideoRef.current && webcamRef.current?.video) {
      const camera = new Camera(webcamRef.current!.video!, {
        onFrame: async () => {
          await faceMesh.send({ image: webcamRef.current!.video! })
        }
      });
      camera.start();
    }

    return () => {
      faceMesh.close();
    }
  }, [ onResults ]);  // MediaPipeの顔検出の準備
  useEffect(() => {
      if (otherUserDataStreams != null) {
        if (nowTest) {
          // 自分自身のウィンドウ情報を追加
          const nowTime_HeadDirection = (performance.now() - startTime) / 1000;
          const currentEntry: CSV_HeadDirection_Info = {
            ID: participantID, condition: conditionID,
            startTime: startTime_HeadDirection, endTime: nowTime_HeadDirection,
            myTheta: myWindowAndAudioAndParticipantsInfo.theta, myDirection: Utils.getParticipantDirection(myWindowAndAudioAndParticipantsInfo.theta),
            myWindowWidth: myWindowAndAudioAndParticipantsInfo.widthInCaseOfChange, myStatusGaze: myWindowAndAudioAndParticipantsInfo.gazeStatus,
            myIsSpeaking: myWindowAndAudioAndParticipantsInfo.isSpeaking, myTranscript: myWindowAndAudioAndParticipantsInfo.transcript,
          }

          // 各リモートユーザのデータを追加
          let userIndex = 1;
          otherUserDataStreams.forEach((stream, memberID) => {
            const remoteUserLatestInfo = (stream as any)._latestData as WindowAndAudioAndParticipantsInfo | undefined;  // _latestDataは内部プロパティ
            if (remoteUserLatestInfo) {
              currentEntry[`otherUser${userIndex}_ID`] = memberID;
              currentEntry[`otherUser${userIndex}_Theta`] = remoteUserLatestInfo.theta;
              currentEntry[`otherUser${userIndex}_Direction`] = Utils.getParticipantDirection(remoteUserLatestInfo.theta);
              currentEntry[`otherUser${userIndex}WindowWidth`] = remoteUserLatestInfo.widthInCaseOfChange;
              currentEntry[`otherUser${userIndex}StatusGaze`] = remoteUserLatestInfo.gazeStatus;
              currentEntry[`otherUser${userIndex}IsSpeaking`] = remoteUserLatestInfo.isSpeaking;
              currentEntry[`otherUser${userIndex}Transcript`] = remoteUserLatestInfo.transcript;
            }
            userIndex++;
          })
          setHeadDirectionResults((prev) => [
            ...prev,
            currentEntry
          ]);
          // setHeadDirectionResults((prev) => [
          //   ...prev,
          //   { ID: participantID, condition: conditionID, 
          //     startTime: startTime_HeadDirection, endTime: nowTime_HeadDirection, 
          //     myTheta: myWindowAndAudioAndParticipantsInfo.theta, myDirection: Utils.getParticipantDirection(myWindowAndAudioAndParticipantsInfo.theta),
          //     myWindowWidth: myWindowAndAudioAndParticipantsInfo.widthInCaseOfChange, myStatusGaze: myWindowAndAudioAndParticipantsInfo.gazeStatus,
          //     myIsSpeaking: myWindowAndAudioAndParticipantsInfo.isSpeaking, myTranscript: myWindowAndAudioAndParticipantsInfo.transcript,
          //     otherTheta: otherUserWindowAndAudioAndParticipantsInfo.theta, otherDirection: Utils.getParticipantDirection(otherUserWindowAndAudioAndParticipantsInfo.theta),
          //     otherWindowWidth: otherUserWindowAndAudioAndParticipantsInfo.widthInCaseOfChange, otherStatusGaze: otherUserWindowAndAudioAndParticipantsInfo.gazeStatus,
          //     otherIsSpeaking: otherUserWindowAndAudioAndParticipantsInfo.isSpeaking, otherTranscript: otherUserWindowAndAudioAndParticipantsInfo.transcript
          //   }
          // ]);
          setStartTime_HeadDirection(nowTime_HeadDirection);  // 計測開始時間を更新
        }
      }
  }, [ nowTest, startTime_HeadDirection, myWindowAndAudioAndParticipantsInfo, otherUserDataStreams ]);  // CSVファイルへの頭部方向・音声データの書き出し
  
  // --- render ---
  return (
    <div>
      <div id="active-before-conference">
        <p>
        Your ID:
        <select id="ID" onChange={(event) => {
           participantID = Number(event.target.value);
        }}>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="13">13</option>
          <option value="14">14</option>
          <option value="15">15</option>
          <option value="16">16</option>
          <option value="17">17</option>
          <option value="18">18</option>
          <option value="19">19</option>
          <option value="20">20</option>
        </select>
        &nbsp;&nbsp;
        condition=
        <select id="condition" onChange={(event) => { 
          conditionID = Number(event.target.value);
          switch(conditionID) {
            case 1:
              conditionName = "Baseline";
              break;
            case 2:
              conditionName = "FrameChange";
              break;
            case 3:
              conditionName = "SizeChange";
              break;
            case 4:
              conditionName = "SizeChange_Discrete";
              break;
            case 5:
              conditionName = "PositionChange";
              break;
            case 6:
              conditionName = "PositionAndSizeChange";
              break;
            default:
              conditionName = "";
              break;
          }
        }}>
          <option value="1">Baseline</option>
          <option value="2">FrameChange</option>
          <option value="3">SizeChange</option>
          <option value="4">SizeChange_Discrete</option>
          {/* <option value="5">PositionChange</option> */}
          {/* <option value="6">PositionAndSizeChange</option> */}
        </select>
        &nbsp;&nbsp;
        room name: <input type="text" value={roomName} onChange={(e) => { setRoomName(e.target.value); }} />
        &nbsp;
        <button onClick={onJoinClick} disabled={!canJoin}>join</button>
        </p>
      </div>
      <div id="active-after-conference" className="non-active">
        ID: { participantID } &nbsp;&nbsp; condition: {conditionName} &nbsp;&nbsp; room name: {roomName}
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <button onClick={testStart} disabled={nowTest}>Measurement Start</button>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <button onClick={testEnd} disabled={!nowTest}>Measurement End</button>
      </div>
      <CSVLink data={headDirectionResults} filename={`C${conditionID}_ID${participantID}_headDirectionResults.csv`} ref={CSVRef} ></CSVLink>
      {/* <div>
        <p>トランスクリプト：{transcript}</p>
      </div> */}
      <div className="icon-container">
        {
          // me != null && otherUserPublications.map(p => (
          //   <RemoteMedia id="remote-video" key={p.id} me={me} publication={p} style={otherUserWindowAndAudioContainerStyle}/>
          // ))
          me != null && Array.from(otherUserPublications.entries()).map(([memberID, publication]) => {
            const remoteDataStream = otherUserDataStreams.get(memberID);
            return (
              <RemoteMedia
                id={`remote-video-${memberID}`}
                key={memberID}
                me={me!}
                publication={publication}
                remoteDataStream={remoteDataStream}
              />
            );
          })
        }
        <div className="icon-container">
          <video id="local-video" ref={localVideoRef} muted playsInline style={myWindowAndAudioContainerStyle}></video>
          <Webcam id="local-video-webcam" ref={webcamRef} videoConstraints={{ deviceId: devices?.[0]?.deviceId }} muted playsInline style={myWindowAndAudioContainerStyle}/>
        </div>
      </div>
    </div>
  )
}