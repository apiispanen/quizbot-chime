// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import './styleV2.scss';
import './dbfunctions';
import './quizbot.js';
import {
  ApplicationMetadata,
  AsyncScheduler,
  Attendee,
  AudioInputDevice,
  AudioProfile,
  AudioVideoFacade,
  AudioVideoObserver,
  BackgroundBlurProcessor,
  BackgroundBlurVideoFrameProcessor,
  BackgroundBlurVideoFrameProcessorObserver,
  BackgroundReplacementProcessor,
  BackgroundReplacementVideoFrameProcessor,
  BackgroundReplacementVideoFrameProcessorObserver,
  BackgroundReplacementOptions,
  ClientMetricReport,
  ConsoleLogger,
  ContentShareObserver,
  DataMessage,
  DefaultActiveSpeakerPolicy,
  DefaultAudioVideoController,
  DefaultBrowserBehavior,
  DefaultDeviceController,
  DefaultMeetingEventReporter,
  DefaultMeetingSession,
  DefaultModality,
  DefaultVideoTransformDevice,
  Device,
  DeviceChangeObserver,
  EventAttributes,
  EventIngestionConfiguration,
  EventName,
  EventReporter,
  LogLevel,
  Logger,
  MeetingEventsClientConfiguration,
  MeetingSession,
  MeetingSessionConfiguration,
  MeetingSessionStatus,
  MeetingSessionStatusCode,
  VideoFxProcessor,
  MeetingSessionVideoAvailability,
  MultiLogger,
  NoOpEventReporter,
  NoOpVideoFrameProcessor,
  VideoFxConfig,
  RemovableAnalyserNode,
  ServerSideNetworkAdaption,
  SimulcastLayers,
  Transcript,
  TranscriptEvent,
  TranscriptionStatus,
  TranscriptionStatusType,
  TranscriptItemType,
  TranscriptResult,
  Versioning,
  VideoDownlinkObserver,
  VideoFrameProcessor,
  VideoInputDevice,
  VideoPriorityBasedPolicy,
  VideoPriorityBasedPolicyConfig,
  VoiceFocusDeviceTransformer,
  VoiceFocusModelComplexity,
  VoiceFocusModelName,
  VoiceFocusPaths,
  VoiceFocusSpec,
  VoiceFocusTransformDevice,
  isAudioTransformDevice,
  isDestroyable,
  BackgroundFilterSpec,
  BackgroundFilterPaths,
  ModelSpecBuilder,
  DefaultEventController,
  MeetingSessionCredentials,
  POSTLogger,
  VideoCodecCapability,
} from 'amazon-chime-sdk-js';
import { Modal } from 'bootstrap';

import TestSound from './audio/TestSound';
import MeetingToast from './util/MeetingToast';
MeetingToast; // Make sure this file is included in webpack
import VideoTileCollection from './video/VideoTileCollection';
import VideoPreferenceManager from './video/VideoPreferenceManager';
import CircularCut from './video/filters/CircularCut';
import EmojifyVideoFrameProcessor from './video/filters/EmojifyVideoFrameProcessor';
import SegmentationProcessor from './video/filters/SegmentationProcessor';
import ResizeProcessor from './video/filters/ResizeProcessor';
import {
  loadBodyPixDependency,
  platformCanSupportBodyPixWithoutDegradation,
} from './video/filters/SegmentationUtil';
import SyntheticVideoDeviceFactory from './video/SyntheticVideoDeviceFactory';
import { getPOSTLogger } from './util/MeetingLogger';
import Roster from './component/Roster';
import ContentShareManager from './component/ContentShareManager';
import {
  AudioBufferMediaStreamProvider,
  SynthesizedStereoMediaStreamProvider,
} from './util/mediastreamprovider/DemoMediaStreamProviders';
import { BackgroundImageEncoding } from './util/BackgroundImage';

let SHOULD_EARLY_CONNECT = (() => {
  return document.location.search.includes('earlyConnect=1');
})();

let SHOULD_DIE_ON_FATALS = (() => {
  const isLocal = document.location.host === '127.0.0.1:8080' || document.location.host === 'localhost:8080';
  const fatalYes = document.location.search.includes('fatal=1');
  const fatalNo = document.location.search.includes('fatal=0');
  return fatalYes || (isLocal && !fatalNo);
})();

export let fatal: (e: Error) => void;

// This shim is needed to avoid warnings when supporting Safari.
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
    demoMeetingAppInstance: DemoMeetingApp;

  }
}

// Support a set of query parameters to allow for testing pre-release versions of
// Amazon Voice Focus. If none of these parameters are supplied, the SDK default
// values will be used.
const search = new URLSearchParams(document.location.search);
const VOICE_FOCUS_NAME = search.get('voiceFocusName') || undefined;
const VOICE_FOCUS_CDN = search.get('voiceFocusCDN') || undefined;
const VOICE_FOCUS_ASSET_GROUP = search.get('voiceFocusAssetGroup') || undefined;
const VOICE_FOCUS_REVISION_ID = search.get('voiceFocusRevisionID') || undefined;

const VOICE_FOCUS_PATHS: VoiceFocusPaths | undefined = VOICE_FOCUS_CDN && {
  processors: `${VOICE_FOCUS_CDN}processors/`,
  wasm: `${VOICE_FOCUS_CDN}wasm/`,
  workers: `${VOICE_FOCUS_CDN}workers/`,
  models: `${VOICE_FOCUS_CDN}wasm/`,
};

function voiceFocusName(
  name: string | undefined = VOICE_FOCUS_NAME
): VoiceFocusModelName | undefined {
  if (name && ['default', 'ns_es'].includes(name)) {
    return name as VoiceFocusModelName;
  }
  return undefined;
}

const VOICE_FOCUS_SPEC = {
  name: voiceFocusName(),
  assetGroup: VOICE_FOCUS_ASSET_GROUP,
  revisionID: VOICE_FOCUS_REVISION_ID,
  paths: VOICE_FOCUS_PATHS,
};

function getVoiceFocusSpec(joinInfo: any): VoiceFocusSpec {
  const es = joinInfo.Meeting.Meeting?.MeetingFeatures?.Audio?.EchoReduction === 'AVAILABLE';
  let spec: VoiceFocusSpec = VOICE_FOCUS_SPEC;
  if (!spec.name) {
    spec.name = es ? voiceFocusName('ns_es') : voiceFocusName('default');
  }
  return spec;
};

const MAX_VOICE_FOCUS_COMPLEXITY: VoiceFocusModelComplexity | undefined = undefined;

const BACKGROUND_BLUR_CDN = search.get('blurCDN') || undefined;
const BACKGROUND_BLUR_ASSET_GROUP = search.get('blurAssetGroup') || undefined;
const BACKGROUND_BLUR_REVISION_ID = search.get('blurRevisionID') || undefined;

const BACKGROUND_BLUR_PATHS: BackgroundFilterPaths = BACKGROUND_BLUR_CDN && {
  worker: `${BACKGROUND_BLUR_CDN}/bgblur/workers/worker.js`,
  wasm: `${BACKGROUND_BLUR_CDN}/bgblur/wasm/_cwt-wasm.wasm`,
  simd: `${BACKGROUND_BLUR_CDN}/bgblur/wasm/_cwt-wasm-simd.wasm`,
};
const BACKGROUND_BLUR_MODEL =
  BACKGROUND_BLUR_CDN &&
  ModelSpecBuilder.builder()
    .withSelfieSegmentationDefaults()
    .withPath(`${BACKGROUND_BLUR_CDN}/bgblur/models/selfie_segmentation_landscape.tflite`)
    .build();
const BACKGROUND_BLUR_ASSET_SPEC = (BACKGROUND_BLUR_ASSET_GROUP || BACKGROUND_BLUR_REVISION_ID) && {
  assetGroup: BACKGROUND_BLUR_ASSET_GROUP,
  revisionID: BACKGROUND_BLUR_REVISION_ID,
};

type VideoFilterName =
  | 'Emojify'
  | 'NoOp'
  | 'Segmentation'
  | 'Resize (9/16)'
  | 'CircularCut'
  | 'Background Blur 10% CPU'
  | 'Background Blur 20% CPU'
  | 'Background Blur 30% CPU'
  | 'Background Blur 40% CPU'
  | 'Background Replacement'
  | 'None'
  | 'Background Blur 2.0 - Low'
  | 'Background Blur 2.0 - Medium'
  | 'Background Blur 2.0 - High'
  | 'Background Replacement 2.0 - (Beach)'
  | 'Background Replacement 2.0 - (Blue)'
  | 'Background Replacement 2.0 - (Default)';

const BACKGROUND_BLUR_V1_LIST: VideoFilterName[] = [
  'Background Blur 10% CPU',
  'Background Blur 20% CPU',
  'Background Blur 30% CPU',
  'Background Blur 40% CPU',
];

const BACKGROUND_REPLACEMENT_V1_LIST: VideoFilterName[] = ['Background Replacement'];

const BACKGROUND_FILTER_V2_LIST: VideoFilterName[] = [
  'Background Blur 2.0 - Low',
  'Background Blur 2.0 - Medium',
  'Background Blur 2.0 - High',
  'Background Replacement 2.0 - (Beach)',
  'Background Replacement 2.0 - (Blue)',
  'Background Replacement 2.0 - (Default)',
];

const VIDEO_FILTERS: VideoFilterName[] = ['Emojify', 'NoOp', 'Resize (9/16)', 'CircularCut'];

type ButtonState = 'on' | 'off' | 'disabled';

const SimulcastLayerMapping = {
  [SimulcastLayers.Low]: 'Low',
  [SimulcastLayers.LowAndMedium]: 'Low and Medium',
  [SimulcastLayers.LowAndHigh]: 'Low and High',
  [SimulcastLayers.Medium]: 'Medium',
  [SimulcastLayers.MediumAndHigh]: 'Medium and High',
  [SimulcastLayers.High]: 'High',
};

const LANGUAGES_NO_WORD_SEPARATOR = new Set(['ja-JP', 'zh-CN']);

interface Toggle {
  name: string;
  oncreate: (elem: HTMLElement) => void;
  action: () => void;
}

interface TranscriptSegment {
  contentSpan: HTMLSpanElement,
  attendee: Attendee;
  startTimeMs: number;
  endTimeMs: number;
}

interface TranscriptionStreamParams {
  contentIdentificationType?: 'PII' | 'PHI';
  contentRedactionType?: 'PII';
  enablePartialResultsStability?: boolean;
  partialResultsStability?: string;
  piiEntityTypes?: string;
  languageModelName?: string;
  identifyLanguage?: boolean;
  languageOptions?: string;
  preferredLanguage?: string;
  vocabularyNames?: string;
  vocabularyFilterNames?: string;
}
interface QuizQuestion {
  answer_reason: string;
  correct_answer: string;
  question: string;
  question_number: number;
  wrong_answers: string[];
}

interface QuizJSON {
  quiz_title: string;
  questions: QuizQuestion[];
  status: string;
  quiz_id: string;

}

interface Answer{
    questionNumber: number
    answer: string | null
    isCorrect: boolean 
}

interface QuizAttempt {
  quiz_id: string
  score: number
  timestamp: string
  user_id: string | null
  answers: Answer[];
}

type Field = {
  label: string;
  type: string;
  value?: string;
  options?: string[];
  correct_answer?: string;
};

type FormData = {
  title: string;
  fields: Field[];
  host: string;
  quiz_id: string; // Assuming quiz_id is a field in the quizJson
};
type Meeting = {
  _id: { $oid: string };
  host_id: string;
  users: number[];
  timestamp: string;
  duration: number;
  meeting_name:string;
};


export class DemoMeetingApp
  implements AudioVideoObserver, DeviceChangeObserver, ContentShareObserver, VideoDownlinkObserver {
  static readonly DID: string = '+17035550122';
  static readonly BASE_URL: string = [
    location.protocol,
    '//',
    location.host,
    location.pathname.replace(/\/*$/, '/').replace('/v2', ''),
  ].join('');

  // *************************** 
  // SEND FORUM MESSAGE FUNCTION
  sendForumMessage = (messageObject: any): void => {
    AsyncScheduler.nextTick(() => {
      if (!messageObject) {
        return;
      }
      this.audioVideo.realtimeSendDataMessage(
        'quizForumQuestion',
        JSON.stringify(messageObject),
        DemoMeetingApp.DATA_MESSAGE_LIFETIME_MS
      );
      this.dataMessageHandler(
        new DataMessage(
          Date.now(),
          'quizForumQuestion',
          new TextEncoder().encode(JSON.stringify(messageObject)),
          this.meetingSession.configuration.credentials.attendeeId,
          this.meetingSession.configuration.credentials.externalUserId
        )
      );
    });
  };
  static testVideo: string =
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.360p.vp9.webm';
  static readonly MAX_MEETING_HISTORY_MS: number = 5 * 60 * 1000;
  static readonly DATA_MESSAGE_TOPIC: string = 'chat';
  static readonly DATA_MESSAGE_LIFETIME_MS: number = 300_000;

  // Ideally we don't need to change this. Keep this configurable in case users have a super slow network.
  loadingBodyPixDependencyTimeoutMs: number = 10_000;
  loadingBodyPixDependencyPromise: undefined | Promise<void>;

  attendeeIdPresenceHandler:
    | undefined
    | ((
        attendeeId: string,
        present: boolean,
        externalUserId: string,
        dropped: boolean
      ) => void) = undefined;
  activeSpeakerHandler: undefined | ((attendeeIds: string[]) => void) = undefined;
  volumeIndicatorHandler:
    | undefined
    | ((
        attendeeId: string,
        volume: number,
        muted: boolean,
        signalStrength: number
      ) => void) = undefined;
  canUnmuteLocalAudioHandler: undefined | ((canUnmute: boolean) => void) = undefined;
  muteAndUnmuteLocalAudioHandler: undefined | ((muted: boolean) => void) = undefined;
  blurObserver: undefined | BackgroundBlurVideoFrameProcessorObserver = undefined;
  replacementObserver: undefined | BackgroundReplacementVideoFrameProcessorObserver = undefined;

  showActiveSpeakerScores = false;
  meeting: string | null = null;
  name: string | null = null;
  voiceConnectorId: string | null = null;
  sipURI: string | null = null;
  region: string | null = null;
  primaryExternalMeetingId: string | undefined = undefined;
  // We cache these so we can avoid having to create new attendees for promotion retries
  // and so the local UX on attendee IDs matches the remote experience
  primaryMeetingSessionCredentials: MeetingSessionCredentials | undefined = undefined;
  meetingSession: MeetingSession | null = null;
  priorityBasedDownlinkPolicy: VideoPriorityBasedPolicy | null = null;
  audioVideo: AudioVideoFacade | null = null;
  deviceController: DefaultDeviceController | undefined = undefined;
  canStartLocalVideo: boolean = true;
  defaultBrowserBehavior: DefaultBrowserBehavior = new DefaultBrowserBehavior();
  videoTileCollection: VideoTileCollection | undefined = undefined;
  videoPreferenceManager: VideoPreferenceManager | undefined = undefined;

  // eslint-disable-next-line
  roster: Roster = new Roster();


  private static _instance: DemoMeetingApp;

  public static getInstance(): DemoMeetingApp {
    if (!this._instance) {
      this._instance = new DemoMeetingApp();
    }
    return this._instance;
  }



  contentShare: ContentShareManager | undefined = undefined;

  cameraDeviceIds: string[] = [];
  microphoneDeviceIds: string[] = [];
  currentAudioInputDevice: AudioInputDevice | undefined;

  buttonStates: { [key: string]: ButtonState } = {
    'button-microphone': 'off',
    'button-camera': 'off',
    'button-speaker': 'on',
    'button-content-share': 'off',
    'button-live-transcription': 'on',
    'button-video-stats': 'off',
    'button-promote-to-primary': 'on',
    'button-video-filter': 'off',
    'button-video-recording-drop': 'off',
    'button-record-self': 'off',
    'button-record-cloud': 'off',
    'button-live-connector': 'off'
  };


  isViewOnly = false;

  // feature flags
  enableWebAudio = false;
  logLevel = LogLevel.DEBUG;
  videoCodecPreferences: VideoCodecCapability[] | undefined = undefined;

  audioCapability: string;
  videoCapability: string;
  contentCapability: string;

  enableSimulcast = false;
  usePriorityBasedDownlinkPolicy = false;
  videoPriorityBasedPolicyConfig = new VideoPriorityBasedPolicyConfig;
  enablePin = false;
  echoReductionCapability = false;
  usingStereoMusicAudioProfile = false;

  supportsVoiceFocus = false;
  enableVoiceFocus = false;
  joinMuted = true;
  voiceFocusIsActive = false;

  supportsBackgroundBlur = true;
  supportsBackgroundReplacement = false; 
  supportsVideoFx = false;

  enableLiveTranscription = true;
  noWordSeparatorForTranscription = false;

  markdown = require('markdown-it')({ linkify: true });
  lastMessageSender: string | null = null;
  lastReceivedMessageTimestamp = 0;
  lastPacketsSent = 0;
  lastTotalAudioPacketsExpected = 0;
  lastTotalAudioPacketsLost = 0;
  lastTotalAudioPacketsRecoveredRed = 0;
  lastTotalAudioPacketsRecoveredFec = 0;
  lastRedRecoveryMetricsReceived = 0;

  meetingSessionPOSTLogger: POSTLogger;
  meetingEventPOSTLogger: POSTLogger;

  meetingHostId: string | null = null;  // Store the current host ID

  hasChromiumWebRTC: boolean = this.defaultBrowserBehavior.hasChromiumWebRTC();

  voiceFocusTransformer: VoiceFocusDeviceTransformer | undefined;
  voiceFocusDevice: VoiceFocusTransformDevice | undefined;
  joinInfo: any | undefined;
  deleteOwnAttendeeToLeave = false;
  disablePeriodicKeyframeRequestOnContentSender = false;
  allowAttendeeCapabilities = false;

  blurProcessor: BackgroundBlurProcessor | undefined;
  replacementProcessor: BackgroundReplacementProcessor | undefined;
  replacementOptions: BackgroundReplacementOptions | undefined;

  // This is an extremely minimal reactive programming approach: these elements
  // will be updated when the Amazon Voice Focus display state changes.
  voiceFocusDisplayables: HTMLElement[] = [];
  analyserNode: RemovableAnalyserNode;

  liveTranscriptionDisplayables: HTMLElement[] = [];

  chosenVideoTransformDevice: DefaultVideoTransformDevice;
  chosenVideoFilter: VideoFilterName = 'None';
  selectedVideoFilterItem: VideoFilterName = 'None';

  DEFAULT_VIDEO_FX_CONFIG: VideoFxConfig = {
    backgroundBlur: {
      isEnabled: true,
      strength: 'high',
    },
    backgroundReplacement: {
      isEnabled: false,
      backgroundImageURL: null,
      defaultColor: 'black',
    }
  };
  videoFxProcessor: VideoFxProcessor | undefined;
  videoFxConfig: VideoFxConfig = this.DEFAULT_VIDEO_FX_CONFIG;

  meetingLogger: Logger | undefined = undefined;




  // Drew Host paste
  
  // Method for the host to remove an attendee
  async removeAttendee(attendeeId: string): Promise<void> {
    if (this.isHost()) {
      try {
        await this.deleteAttendee(this.meeting, attendeeId);
        this.log(`Host has removed attendee: ${attendeeId}`);
      } catch (error) {
        this.log(`Failed to remove attendee: ${error}`);
      }
    } else {
      this.log('Only the host can remove attendees');
    }
  }
  
  // Method to determine if the current user is the host
  isHost(): boolean {
    return localStorage.getItem("userId") === localStorage.getItem("host_id");
  }
  
  // Method to pass host privileges to another attendee
  passHostPrivileges(newHostId: string): void {
    if (this.isHost()) {
      this.meetingHostId = newHostId;
      // Pass host-related data to other attendees, such as through data messages
      // this.audioVideo?.realtimeSendDataMessage(...)
      this.log(`Host privileges passed to attendee: ${newHostId}`);
    } else {
      this.log('Only the host can pass host privileges');
    }
  }
  
  // Create a quiz by the host
  async createQuiz(): Promise<void> {
    if (this.isHost()) {
      // Logic to create and present a quiz...
      this.log('Host is creating a quiz');
      // You may also use realtimeSendDataMessage to communicate the quiz creation to other attendees
    } else {
      this.log('Only the host can create a quiz');
    }
  }
  
  // Add a handler to the onDataMessage event to listen for host transfer requests
  setupHostTransferHandler(): void {
    this.audioVideo.realtimeSubscribeToReceiveDataMessage('transferHost', (dataMessage: DataMessage) => {
      const messageData = JSON.parse(dataMessage.text());
      if (messageData.action === 'transferHost' && this.isHost()) {
        this.passHostPrivileges(messageData.newHostId);
      }
    });
  }
  // END DREW HOST PASTE


  // If you want to make this a repeatable SPA, change this to 'spa'
  // and fix some state (e.g., video buttons).
  // Holding Shift while hitting the Leave button is handled by setting
  // this to `halt`, which allows us to stop and measure memory leaks.
  // The `nothing` option can be used to stop cleanup from happening allowing
  // `audioVideo` to be reused without stopping the meeting.
  behaviorAfterLeave: 'spa' | 'reload' | 'halt' | 'nothing' = 'reload';

  videoMetricReport: { [id: string]: { [id: string]: {} } } = {};

  removeFatalHandlers: () => void;

  transcriptContainerDiv = document.getElementById('transcript-container') as HTMLDivElement;
  partialTranscriptDiv: HTMLDivElement | undefined;
  partialTranscriptResultTimeMap = new Map<string, number>();
  partialTranscriptResultMap = new Map<string, TranscriptResult>();
  transcriptEntitySet = new Set<string>();

  addFatalHandlers(): void {
    fatal = this.fatal.bind(this);

    const onEvent = (event: ErrorEvent): void => {
      // In Safari there's only a message.
      fatal(event.error || event.message);
    };

    // Listen for unhandled errors, too.
    window.addEventListener('error', onEvent);

    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      fatal(event.reason);
    };

    this.removeFatalHandlers = () => {
      window.onunhandledrejection = undefined;
      window.removeEventListener('error', onEvent);
      fatal = undefined;
      this.removeFatalHandlers = undefined;
    };
  }

  eventReporter: EventReporter | undefined = undefined;
  enableEventReporting = false;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).app = this;

    this.addFatalHandlers();

    if (document.location.search.includes('testfatal=1')) {
      this.fatal(new Error('Testing fatal.'));
      return;
    }

    (document.getElementById('sdk-version') as HTMLSpanElement).innerText =
      'amazon-chime-sdk-js@' + Versioning.sdkVersion;
    this.initEventListeners();
    this.initParameters();
    this.setMediaRegion();
    if (this.isRecorder() || this.isBroadcaster()) {
      AsyncScheduler.nextTick(async () => {
        this.meeting = new URL(window.location.href).searchParams.get('m');
        this.name = this.isRecorder() ? '«Meeting Recorder»' : '«Meeting Broadcaster»';
        await this.authenticate();
        await this.openAudioOutputFromSelection();
        await this.join();
        this.displayButtonStates();
        this.switchToFlow('flow-meeting');
      });
    } else {
      this.switchToFlow('flow-authenticate');
    }
  }

  /**
   * We want to make it abundantly clear at development and testing time
   * when an unexpected error occurs.
   * If we're running locally, or we passed a `fatal=1` query parameter, fail hard.
   */
  fatal(e: Error | string): void {
    // Muffle mode: let the `try-catch` do its job.
    if (!SHOULD_DIE_ON_FATALS) {
      console.info('Ignoring fatal', e);
      return;
    }

    console.error('Fatal error: this was going to be caught, but should not have been thrown.', e);

    if (e && e instanceof Error) {
      document.getElementById('stack').innerText = e.message + '\n' + e.stack?.toString();
    } else {
      document.getElementById('stack').innerText = '' + e;
    }

    // this.switchToFlow('flow-fatal');
  }

  initParameters(): void {
    const meeting = new URL(window.location.href).searchParams.get('m');
    if (meeting) {
      (document.getElementById('inputMeeting') as HTMLInputElement).value = meeting;
      (document.getElementById('inputName') as HTMLInputElement).focus();
    } else {
      (document.getElementById('inputMeeting') as HTMLInputElement).focus();
    }
  }

  async initVoiceFocus(): Promise<void> {
    const logger = new ConsoleLogger('SDK', LogLevel.DEBUG);
    if (!this.enableWebAudio) {
      logger.info('[DEMO] Web Audio not enabled. Not checking for Amazon Voice Focus support.');
      return;
    }

    const spec: VoiceFocusSpec = getVoiceFocusSpec(this.joinInfo);

    try {
      this.supportsVoiceFocus = await VoiceFocusDeviceTransformer.isSupported(spec, {
        logger,
      });
      if (this.supportsVoiceFocus) {
        this.voiceFocusTransformer = await this.getVoiceFocusDeviceTransformer(
          MAX_VOICE_FOCUS_COMPLEXITY
        );
        this.supportsVoiceFocus =
          this.voiceFocusTransformer && this.voiceFocusTransformer.isSupported();
        if (this.supportsVoiceFocus) {
          logger.info('[DEMO] Amazon Voice Focus is supported.');
          document.getElementById('voice-focus-setting').classList.remove('hidden');
          return;
        }
      }
    } catch (e) {
      // Fall through.
      logger.warn(`[DEMO] Does not support Amazon Voice Focus: ${e.message}`);
    }
    logger.warn('[DEMO] Does not support Amazon Voice Focus.');
    this.supportsVoiceFocus = false;
    document.getElementById('voice-focus-setting').classList.toggle('hidden', true);
  }

  async initBackgroundBlur(): Promise<void> {
    try {
      this.supportsBackgroundBlur = await BackgroundBlurVideoFrameProcessor.isSupported(
        this.getBackgroundBlurSpec()
      );
    } catch (e) {
      this.log(`[DEMO] Does not support background blur: ${e.message}`);
      this.supportsBackgroundBlur = false;
    }
  }

  /**
   * Determine if the videoFxProcessor is supported in current environment
   */
  async resolveSupportsVideoFX(): Promise<void> {
    const logger = new ConsoleLogger('SDK', LogLevel.DEBUG);
    try {
      this.supportsVideoFx = await VideoFxProcessor.isSupported(logger)
    } catch (e) {
      this.log(`[DEMO] Does not support background blur/background replacement v2: ${e.message}`);
      this.supportsVideoFx = false;
    }
  }

  async createReplacementImageBlob(startColor: string, endColor: string): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 250, 0);
    grd.addColorStop(0, startColor);
    grd.addColorStop(1, endColor);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 500, 500);
    const blob = await new Promise<Blob>(resolve => {
      canvas.toBlob(resolve);
    });
    return blob;
  }

  /**
   * The image blob in this demo is created by generating an image
   * from a canvas, but another common scenario would be to provide
   * an image blob from fetching a URL.
   *   const image = await fetch('https://someimage.jpeg');
   *   const imageBlob = await image.blob();
   */
  async getBackgroundReplacementOptions(): Promise<BackgroundReplacementOptions> {
    if (!this.replacementOptions) {
      const imageBlob = await this.createReplacementImageBlob('#000428', '#004e92');
      this.replacementOptions = { imageBlob };
    }
    return this.replacementOptions;
  }

  async initBackgroundReplacement(): Promise<void> {
    try {
      this.supportsBackgroundReplacement = await BackgroundReplacementVideoFrameProcessor.isSupported(
        this.getBackgroundBlurSpec(),
        await this.getBackgroundReplacementOptions()
      );
    } catch (e) {
      this.log(`[DEMO] Does not support background replacement: ${e.message}`);
      this.supportsBackgroundReplacement = false;
    }
  }

  private async onVoiceFocusSettingChanged(): Promise<void> {
    this.log('[DEMO] Amazon Voice Focus setting toggled to', this.enableVoiceFocus);
    this.openAudioInputFromSelectionAndPreview();
  }

  initEventListeners(): void {
    const buttonJoinMeeting = document.getElementById('join-meeting') as HTMLButtonElement;
    buttonJoinMeeting.addEventListener('click', _e => {
      var x = document.getElementById('joining-page');
      var joining_page = document.getElementById('main-page');
      if (x.style.display === 'none') {
        x.style.display = 'block';
      } else {
        x.style.display = 'none';
        joining_page.style.display = 'flex';
        this.switchToFlow('flow-authenticate');
      }
    });
    // do the exact same for new-meeting button
    const buttonNewMeeting = document.getElementById('new-meeting') as HTMLButtonElement;
    buttonNewMeeting.addEventListener('click', _e => {
      var x = document.getElementById('joining-page');
      var joining_page = document.getElementById('main-page');
      if (x.style.display === 'none') {
        x.style.display = 'block';
      } else {
        x.style.display = 'none';
        joining_page.style.display = 'flex';
        this.switchToFlow('flow-authenticate');

      }
    }
    );

    // do the same functions if ?m= is in the url (instead of clicking):
    const meetingParam:any = new URL(window.location.href).searchParams.get('m');
    if (meetingParam && localStorage.getItem('authToken')) {
      var join_button = document.getElementById('joining-page');
      var joining_page = document.getElementById('main-page');
      if (join_button.style.display === 'none') {
        join_button.style.display = 'block';
      } else {
        join_button.style.display = 'none';
        joining_page.style.display = 'flex';
      }
    };

    const registerParam:any = new URL(window.location.href).searchParams.get('register');
    if (registerParam) {
      document.getElementById('login-container').style.display = 'block';
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('register-container').style.display = 'block';
    };




    const buttonQueriesTabs = document.getElementById('queries') as HTMLButtonElement;
    buttonQueriesTabs.addEventListener('click', _e => {
      var participants_block = document.getElementById('participants-block');
      var queries_block = document.getElementById('queries-block');
      const element = document.getElementById('queries');
      const participants = document.getElementById('participants');
      element.classList.add('activeTabs');
      participants.classList.remove('activeTabs');
      participants_block.style.display = 'none';
      queries_block.style.display = 'block';
    });
    const buttonTabs = document.getElementById('participants') as HTMLButtonElement;
    buttonTabs.addEventListener('click', _e => {
      const queries = document.getElementById('queries');
      const element = document.getElementById('participants');
      queries.classList.remove('activeTabs');
      element.classList.add('activeTabs');
      var participants_block = document.getElementById('participants-block');
      var queries_block = document.getElementById('queries-block');
      participants_block.style.display = 'block';
      queries_block.style.display = 'none';
    });
    const buttonTranscription = document.getElementById(
      'transcription-button'
    ) as HTMLButtonElement;
    buttonTranscription.addEventListener('click', _e => {
      var x = document.getElementById('transcript-container');
      if (x.style.display === 'none') {
        x.style.display = 'block';
        this.toggleButton('button-live-transcription');
      } else {
        x.style.display = 'none';
        this.toggleButton('button-live-transcription');
      }
    });




    // SEND QUIZBOT FORM TO USERS DREW SEND

    const buttonPublishQuiz = document.getElementById('publish-quiz-button') as HTMLButtonElement;
    buttonPublishQuiz.addEventListener('click', _e => {
      var x = document.getElementById('quiz_in_progress');
      var html_quiz_question = document.getElementById('quiz_question');
      if (x) {
        x.style.display = 'block';
        html_quiz_question.style.display = 'none';
      } 
    
      // Fetch the stored quiz data
      const storedQuiz: QuizJSON = JSON.parse(localStorage.getItem('quizJson') || '{}');

      // DREW ADDITIONS

      const generateFormData = (quiz: QuizJSON) => {
        const questions: QuizQuestion[] = quiz.questions;
    
        const formData = {
            title: quiz.quiz_title,
            fields: [
                { label: 'Quiz Title', type: 'text', value: quiz.quiz_title }, 
                ...questions.map((question) => {
                    return {
                        label: question.question,
                        type: 'dropdown',
                        options: [question.correct_answer, ...question.wrong_answers],
                        correct_answer: question.correct_answer,
                    };
                })
            ],
            host: this.meetingSession.configuration.credentials.attendeeId,
            quiz_id: quiz.quiz_id
        };
    
        return formData;
    }
    
    const formData = generateFormData(storedQuiz);
    console.log("Checkpoint 2 Form Data", formData);

    console.log(formData);
    

      // END DREW ADDITIONS



      const formDataString = JSON.stringify(formData);
      console.log('Checkpoint 3 formDataString:', formDataString);
    
      // Send the formData as a stringified JSON
      this.audioVideo.realtimeSendDataMessage(
        'displayForm',
        formDataString,
        DemoMeetingApp.DATA_MESSAGE_LIFETIME_MS
      );
    
      this.dataMessageHandler(
        new DataMessage(
          Date.now(),
          'displayForm',
          new TextEncoder().encode(formDataString),
          this.meetingSession.configuration.credentials.attendeeId,
          this.meetingSession.configuration.credentials.externalUserId
        )
      );
    });
    
    // make a function displayForm():
    // Sample data for radio buttons




    // this.dataMessageHandler(
    //   new DataMessage(
    //     Date.now(),
    //     'displayForm',
    //     new TextEncoder().encode(formDataString),
    //     this.meetingSession.configuration.credentials.attendeeId,
    //     this.meetingSession.configuration.credentials.externalUserId
    //   )
    // );
  



const buttonChat = document.getElementById('button-chat') as HTMLButtonElement | null;
buttonChat?.addEventListener('click', _e => {
  const x = document.getElementById('roster-message-container');
  if (x && (x.style.display === 'none' || x.classList.contains('d-none'))) {
    x.classList.remove('d-none');
    x.classList.add('d-flex');
    x.style.display = 'block';
  } else {
    x?.classList.add('d-none');
    x?.classList.remove('d-flex');
    if (x) {
      x.style.display = 'none';
    }
  }
});






const registerButton = document.getElementById('go-to-register') as HTMLButtonElement | null;
registerButton?.addEventListener('click', _e => {
  const x = document.getElementById('loginForm');
  const y = document.getElementById('register-container');
  if (x && x.style.display === 'none') {
    x.style.display = 'block';
    if (y) {
      y.style.display = 'none';
    }
  } else {
    if (x) {
      x.style.display = 'none';
    }
    if (y) {
      y.style.display = 'block';
    }
  }
});

const loginButton = document.getElementById('login') as HTMLButtonElement | null;
loginButton?.addEventListener('click', _e => {
  const x = document.getElementById('register-container');
  const y = document.getElementById('loginForm');
  if (x && x.style.display === 'none') {
    x.style.display = 'block';
    if (y) {
      y.style.display = 'none';
    }
  } else {

  if (x) {
    x.style.display = 'none';
  }
  if (y) {
    y.style.display = 'block';
  }
  updateBodyBackgroundColor(); // Call this at the end of both event listeners
    

  }
});

const body = document.getElementById('body');
const loginContainer = document.getElementById('login-container');
const registerContainer = document.getElementById('register-container');
if (loginContainer && loginContainer.style.display === 'block' || registerContainer && registerContainer.style.display === 'block') {
  if (body) {
    body.style.background = '#1e1e1e';
  }
} else {
  if (body) {
    body.style.background = '#fff';
  }
}

function updateBodyBackgroundColor() {
  const loginContainer = document.getElementById('login-container');
  const registerContainer = document.getElementById('register-container');
  const body = document.getElementById('body');

  if (
    (loginContainer && loginContainer.style.display === 'block') || 
    (registerContainer && registerContainer.style.display === 'block')
  ) {
    if (body) {
      body.style.background = '#1e1e1e';
    }
  } else {
    if (body) {
      body.style.background = '#fff';
    }
  }
}

// Initial call
updateBodyBackgroundColor();


    // FAULTY CODE


    const startingQuizButton = document.getElementById('starting-quiz') as HTMLButtonElement;
    startingQuizButton.addEventListener('click', _e => {
      var roster_tile_container = document.getElementById('roster-tile-container');
      var starting_quiz_container = document.getElementById('starting_quiz_container');
      if (starting_quiz_container.style.display === 'none') {
        starting_quiz_container.style.display = 'flex';
        // roster_tile_container.style.display = 'none !important';
        roster_tile_container.setAttribute('style', 'display:none !important');
      } else {
        starting_quiz_container.style.display = 'none';
      }
    });

    const buttonParticipants = document.getElementById('button-participants') as HTMLButtonElement;
    buttonParticipants.addEventListener('click', _e => {
      console.log('button-participants');

      var x = document.getElementById('roster-message-container');
      if (x.style.display === 'none' || x.classList.contains('d-none')) {
        // add d-hidden to hide the roster
        x.classList.remove('d-none');
        x.classList.add('d-flex');
        x.style.display = 'block';
      } else {
        x.classList.add('d-none');
        x.classList.remove('d-flex');
        x.style.display = 'none';
      }
    });


    // *****************************
    // *****************************
    // *****************************
    // BEGIN QUIZBOT
    
    const submitQuizBot = document.getElementById('submit-quiz') as HTMLButtonElement;
    submitQuizBot.addEventListener('click', async (): Promise<void> => {


      if (this.isHost()){
        console.log("You're are host, you can create Quiz!");
      }
      else{
        console.log("You're not the host, you can't create quizzes!");
        alert("You're not the host, you can't create quizzes!");
        return;
      }
        // STEP 1: CONFIGURATION FORM
        const create_quiz = document.getElementById('create-quiz');
        var generating_quiz = document.getElementById('generating-quiz');
        var html_quiz_question = document.getElementById('quiz_question'); 
        if (generating_quiz) {
          create_quiz.style.display = 'none';
          generating_quiz.style.display = 'block';
        } 


        console.log('submit quiz');
        const transcript = document.getElementById('transcript-container').innerText;

        const transcriptData: any = {
            "transcript": transcript
            // "transcript" : "This is a test transcript, I want to see if this works. There are 5 questions in this quiz. This quiz was made on October 11th 2023. We will be quizzing on this content."
          };

        let selectedNumber = localStorage.getItem('selectedNumber')
        if (selectedNumber) {
            transcriptData.num_questions = selectedNumber;
            console.log('selectedNumber:', selectedNumber);
        }
        let vector_id = localStorage.getItem('vector_id')
        if (vector_id) {
            transcriptData.vector_id = vector_id;
            console.log('vector_id:', vector_id);
        }

        let userID = JSON.parse(localStorage.getItem('data')).user_id;
        if (userID) {
            transcriptData.user_id = userID;
            console.log('user_id:', userID);
        }


        
        const url = "https://app.larq.ai/api/MakeQuiz";
        console.log("TRANSCRIPT DATA:", transcriptData);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transcriptData)
        })
        // on response, show #html_quiz_question:
        const quizJson = await response.json();
        // localStorage.setItem("quizID", quizJson.quiz_id);
        html_quiz_question.style.display = 'block';
        generating_quiz.style.display = 'none';

        // BELOW IS THE STRUCTURE OF THE QUIZ RESPONSE
        // const quizJson = {
        //     quiz_title: 'History 101',
        //     questions: [
        //       {
        //         answer_reason: 'The Magna Carta was sealed by King John in the year 1215.',
        //         correct_answer: '1215',
        //         question: 'In which year was the Magna Carta sealed?',
        //         question_number: 1,
        //         wrong_answers: ['1200', '1230', '1150'],
        //       },
        //       {
        //         answer_reason:
        //           'The primary aim of the Renaissance was the revival of classical learning and wisdom.',
        //         correct_answer: 'Revival of classical learning',
        //         question: 'What was the primary aim of the Renaissance?',
        //         question_number: 2,
        //         wrong_answers: [
        //           'Promotion of modern art',
        //           'Start of the industrial revolution',
        //           'Promotion of religious beliefs',
        //         ],
        //       },
        //       {
        //         answer_reason:
        //           'Galileo Galilei was known for his contributions to the fields of physics, astronomy, and modern science.',
        //         correct_answer: 'Galileo Galilei',
        //         question: 'Who is known as the father of observational astronomy?',
        //         question_number: 3,
        //         wrong_answers: ['Isaac Newton', 'Albert Einstein', 'Nikola Tesla'],
        //       },
        //     ]
        // };
        console.log('quizJson:', quizJson);
        
        // add quizJson to the local storage
        localStorage.setItem('quizJson', JSON.stringify(quizJson));

        // const quizID = quizJson.quiz_id;
        // localStorage.setItem('quizID', quizID);
        const quizTitle = quizJson.quiz_title;
        console.log(quizTitle);

        const quizTitleHTML = document.getElementById('quiz-title') as HTMLElement;
        quizTitleHTML.innerText = quizTitle;

        const quizFormTitleHTML = document.getElementById('quiz-form-title') as HTMLElement;
        quizFormTitleHTML.innerText = quizTitle;

        const questions = quizJson.questions;
        console.log(questions);

        const quizNumbers = document.getElementById('quiz-numbers') as HTMLElement;
        // clear html of quizNumbers
        quizNumbers.innerHTML = '';
        const quizQuestionElement = document.getElementById('quiz-question') as HTMLElement;
        const quizOptions = document.getElementById('quiz-options') as HTMLElement;

        // Populate quiz numbers
        questions.forEach(
          (
            question: {
              answer_reason: string;
              correct_answer: string;
              question: string;
              question_number: number;
              wrong_answers: string[];
            },
            index: number
          ) => {
            let questionNumber = question.question_number;
            let questionBlock = document.createElement('div');
            questionBlock.className = 'numbers-block';
            questionBlock.innerText = `${questionNumber}`;
            quizNumbers.appendChild(questionBlock);

            // Attach a click event to each questionBlock
            questionBlock.addEventListener('click', function () {
              // Display the selected question and its options

                    console.log('questionNumber', questionNumber);
                    const currentActive = document.querySelector('.numbers-block.active-numbers-block');
                    if (currentActive) {
                      currentActive.classList.remove('active-numbers-block');
                    }
                    questionBlock.classList.add('active-numbers-block');

                    quizQuestionElement.innerText = question.question;
                    quizOptions.innerHTML = ''; // Clear previous options

                    let correctAnswer = question.correct_answer;
                    let wrongAnswers = question.wrong_answers;
                    let allAnswers = [correctAnswer, ...wrongAnswers]; // No randomization

                    allAnswers.forEach((answer, ansIndex) => {
                      let optionLabel = document.createElement('label');
                      optionLabel.className = 'form-check form-check-inline';
                      
                      let optionInput = document.createElement('input');
                      optionInput.type = 'radio';
                      optionInput.id = `option-${index}-${ansIndex}`;
                      optionInput.name = 'option';
                      optionInput.value = `${ansIndex}`;
                      optionInput.className = 'btn-check form-check-input';
                      // DRAFT ANSWERS (FOR REFERENCE)
                      if (answer === correctAnswer) {
                        // Check the correct answer
                        optionInput.checked = true;
                        optionLabel.classList.add('correct-answer');
                      }
                      else{
                        optionLabel.classList.remove('correct-answer');
                      }

                      let answerselectorLabel = document.createElement('label');
                      answerselectorLabel.className = 'btn btn-outline';
                      answerselectorLabel.htmlFor = optionInput.id;
                      answerselectorLabel.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12L9 16L19 6" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

                      let answerLabel = document.createElement('input');
                      answerLabel.className = 'form-control answer-text w-75';
                      // answerLabel.htmlFor = optionInput.id;
                      answerLabel.value = answer;

                      optionLabel.appendChild(optionInput);
                      optionLabel.appendChild(answerselectorLabel);
                      optionLabel.appendChild(answerLabel);
                      quizOptions.appendChild(optionLabel);
                      
                    quizQuestionElement.addEventListener('click', function () {
                                this.contentEditable = 'true';
                                // click on the object again now that its editable
                                this.focus();
                                const originalText = this.textContent;
                        
                                this.addEventListener('blur', function () {
                                    const newText = this.textContent?.trim() || '';
                                    this.contentEditable = 'false';
                        
                                    if (newText !== originalText) {
                                        question.question = newText;
                                        localStorage.setItem('quizJson', JSON.stringify(quizJson));
                                        console.log('quizJson in localstorage:', quizJson);
                                    }
                                }, { once: true });
                              // End of questionElement.addEventListener
                      });
  
                      quizTitleHTML.addEventListener('click', function () {
                        this.contentEditable = 'true';
                        this.focus();
                        const originalText = this.textContent;
                
                        this.addEventListener('blur', function () {
                            const newText = this.textContent?.trim() || '';
                            this.contentEditable = 'false';
                
                            if (newText !== originalText) {
                                // Assuming you have a title field in your quizJson.
                                quizJson.quiz_title = newText;
                                localStorage.setItem('quizJson', JSON.stringify(quizJson));
                                console.log('quizJson in localstorage:', quizJson);
                            }
                        }, { once: true });
                    });
                

                    optionLabel.addEventListener('click', () => {
                                answerLabel.contentEditable = 'true';
                                optionLabel.classList.add('editing');
                                // optionLabel.classList.add('form-control');
                                this.focus();
                                const originalText = answerLabel.value;
                
                                answerLabel.addEventListener('blur', () => {
                                  const newText = answerLabel.value?.trim() || '';
                                    answerLabel.contentEditable = 'false';
                                    optionLabel.classList.remove('editing');
                                    // optionLabel.classList.remove('form-control');
                    
                                        if (newText === '') {
                                          answerLabel.value = answer;
                                        }
                                      
                                        if (newText !== originalText) {
                                          // Update the answer label in the DOM
                                          answerLabel.value = newText;
                                      }
                                      if (optionInput.checked) {
                                        // If this option is checked, update the correct answer
                                        question.correct_answer = newText;
                                           } else {
                                        // Update a wrong answer
                                        question.wrong_answers[ansIndex - 1] = newText;
                                          }
                                                          
                                        localStorage.setItem('quizJson', JSON.stringify(quizJson));
                                        console.log('quizJson in localstorage:', quizJson);
  
                          }, { once: true }); // Ensure the blur event only fires once per editing session
                         
                          // if there has been a click that is not the option label, then remove the editing class
                          document.addEventListener('click', (event) => {
                            const target = event.target as HTMLElement;
                            if (!target.classList.contains('editing')) {
                              optionLabel.classList.remove('editing');
                              // optionLabel.classList.remove('form-control');
                            }
                          });
                         
                          optionInput.addEventListener('change', () => {
                            if (optionInput.checked) {
                              optionLabel.classList.add('correct-answer');
                              // remove the correct-answer class from all other options
                              const allOptionLabels = document.querySelectorAll('.form-check.form-check-inline');
                              allOptionLabels.forEach((label) => {
                                if (label !== optionLabel) {
                                  label.classList.remove('correct-answer');
                                }
                              });
                              
                                // Update the correct answer.
                                question.correct_answer = answerLabel.innerText;
                                localStorage.setItem('quizJson', JSON.stringify(quizJson));
                                console.log('quizJson in localstorage:', quizJson);
                            }
                           });
                
                
                    
                          
                            // End of optionLabel.addEventListener 
                          });
                      // End of allAnswers.forEach
                    });
                    // End of Click form
                  });
                  if (index === 0) {
                    (questionBlock as HTMLElement).click();
                  }
        
              // End of questions.forEach
            });
          
          // Promise and quizbot
          


          }
        );

        // DREW CODE END
        // document.addEventListener('DOMContentLoaded', function() {
                // Get the form element
                console.log("Dom loaded");
                const myDIV = document.getElementById('myDIV');
            
                const video_container = document.getElementById('content-share-video');
                const starting_quiz_container = document.getElementById('starting_quiz_container');
                const meeting_container = document.getElementById('meeting-container');
                const roster_tile_container = document.getElementById('roster-tile-container');
                // Function to close the form (hide it in this case)
                function closeForm() {
                    if (myDIV) {
                      meeting_container.style.display = 'block';  
                      video_container.style.display = 'block',
                      myDIV.style.display = 'none';
                      roster_tile_container.style.display = 'block';
                    }
                    if (starting_quiz_container){
                      meeting_container.style.display = 'block';  
                      video_container.style.display = 'block',
                      starting_quiz_container.style.display = 'none';
                      roster_tile_container.style.display = 'block';
                    }
                }
            
                // Listen to clicks on elements with class .btn-close and .cancel-button
                document.querySelectorAll('.cancel-button').forEach(button => {
                        button.addEventListener('click', closeForm);
                });

                document.querySelectorAll('.deleteButton').forEach(button => {
                      button.addEventListener('click', function(){

                        var html_create_quiz = document.getElementById('create-quiz');
                        var html_quiz_question = document.getElementById('quiz_question');
                        var generating_quiz = document.getElementById('generating-quiz');
                        html_create_quiz.style.display = 'block';
                          html_quiz_question.style.display = 'none';
                          generating_quiz.style.display = 'none';
                  
                });
        });
        




        // FIRST FORM NUMBER OF QUESTIONS
          let selectedNumber: string | null = null;
      
          const numberContainer = document.getElementById('numberofQuestions');
      
          if (numberContainer) {
              numberContainer.addEventListener('click', (event) => {
                  const target = event.target as HTMLElement;
      
                  if (target.classList.contains('numbers-block')) {
                      // Remove active-numbers-block class from all children
                      Array.from(numberContainer.children).forEach(child => {
                          (child as HTMLElement).classList.remove('active-numbers-block');
                      });
      
                      selectedNumber = target.getAttribute('value');
                      // console.log('selectedNumber:', selectedNumber);
                      // add active-numbers-block class
                      target.classList.add('active-numbers-block');
                      // save it to localstorage
                      localStorage.setItem('selectedNumber', selectedNumber);
                        }
                    });
                }
      
      




          
      // });
    // END QUIZBOT
   // *****************************
    // *****************************
    // *****************************
    // load the js file quizbot.js

    // when you click #joinButton, also click #button-start-transcription:
    const joinButton = document.getElementById('joinButton');
    joinButton?.addEventListener('click', function() {
      var startTranscription = document.getElementById('button-start-transcription');
      if (startTranscription) {
        (startTranscription as HTMLElement).click();
      }
    });


    var tc = document.getElementById('transcript-container');
    if (tc) {
      tc.style.display = 'block';
      // this.toggleButton('button-live-transcription');
    }






// DREW LOGIN

// if you have localStorage.getItem('authToken') then hide the login form and show the joining page:
if (!localStorage.getItem('authToken')) {
  document.getElementById('login-container')!.style.display = 'block';
  document.getElementById('joining-page')!.style.display = 'none';
  document.getElementById('flow-meeting')!.style.display = 'none';
  // this.switchToFlow('login-container');
} else if (localStorage.getItem('authToken') === 'viewonly') {
  this.isViewOnly = true;
}


// Assuming you have a type definition for the response data structure. 
// If not, you can use 'any' or create a more detailed type.

interface ResponseData {
  status: string;
  token?: string;
  message?: string;
  user_id?: string;
  first_name?: string;
  last_name?: string;
}
document.querySelector('#loginForm')?.addEventListener('submit', (event: Event) => {
  event.preventDefault();
  document.getElementById('incorrect-pass')!.style.display = 'none';
  const loginSpinner = document.getElementById('login-spinner')!;
  loginSpinner.style.display = 'block';

  const targetForm = event.target as HTMLFormElement;
  const username: string = targetForm.username.value.toLowerCase();
  // take the lowercase of the username

  const password: string = targetForm.password.value;

  // Convert username and password to base64
  const base64Credentials = btoa(username + ':' + password);

  fetch("https://app.larq.ai/api/login", {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + base64Credentials
      }
  }).then(response => {
    if (!response.ok) {
      throw new Error('Login failed. Please check your username and password.');
    }
    return response.json();
  }).then((data: ResponseData) => {
    if (data.status === 'success') {
    console.log('Success:', data);
    localStorage.setItem('authToken', data.token!);
    localStorage.setItem('firstName', data.first_name!);
    localStorage.setItem('lastName', data.last_name!);
    localStorage.setItem('userId', data.user_id!);
    localStorage.setItem('data', JSON.stringify(data));
    // hide #login-spinner
    document.getElementById('login-spinner')!.style.display = 'none';
    // reload page
    location.reload();
    // document.getElementById('login-container')!.style.display = 'none';
    // document.getElementById('joining-page')!.style.display = 'block';

    // Console log user_id and last_name
    console.log("User ID:", data.user_id);
    console.log("Last Name:", data.last_name);
    // console.log("Dashboard Stats:", data.dashboard_stats);


  } else {
    // Handle non-successful response
    loginSpinner.style.display = 'none';
    document.getElementById('incorrect-pass')!.innerHTML = 'Incorrect username or password.';
    document.getElementById('incorrect-pass')!.style.display = 'block';
  }
  loginSpinner.style.display = 'none';
})
.catch(error => {
  loginSpinner.style.display = 'none';
  document.getElementById('incorrect-pass')!.style.display = 'block';
  document.getElementById('incorrect-pass')!.innerHTML = error.message;
});
});



  // Drew take 2
    // Retrieve data from localStorage
    const data = JSON.parse(localStorage.getItem('data')).dashboard_stats;
    const emptyDash = document.getElementById('empty-dash') as HTMLElement;
    const fullDash = document.getElementById('full-dash') as HTMLElement;

    // Check if data exists and has recent_quizzes
    if (data && data.recent_quizzes && data.recent_quizzes.length > 0) {
        const recentQuiz = data.recent_quizzes[0];  // Most recent quiz
        if (fullDash && emptyDash) {
          fullDash.style.display = 'block';
            emptyDash.style.display = 'none';

        }
        document.getElementById('recentQuizTitle').textContent = `Science: Chapter ${recentQuiz.meeting_id}`;
            // Calculate the Class Average for the recent quiz
            const recentQuizAttempts = (data.last_attempts && Array.isArray(data.last_attempts)) ? 
            data.last_attempts.filter((attempt: { quiz_id: any[] }) => attempt.quiz_id === recentQuiz.meeting_id) : [];
            const recentAverage = recentQuizAttempts.reduce((acc: number, curr: { score: number }) => acc + curr.score, 0) / recentQuizAttempts.length;
        document.getElementById('recentClassAverage').textContent = recentAverage.toFixed(2);


        // Populate the dashboard with real data

        // Calculate the Class Average
        const average = (data.last_attempts && Array.isArray(data.last_attempts)) ? 
        data.last_attempts.reduce((acc: number, curr: { score: number }) => acc + curr.score, 0) / data.last_attempts.length : 0;
        const classAverageElem = document.getElementById('classAverage');
      if(classAverageElem) {
          classAverageElem.textContent = average.toFixed(2);
        }


        // Assuming the most difficult question is the one most frequently answered incorrectly
        // This is just a placeholder, you'll need to replace with actual logic
        document.getElementById('mostDifficultQuestion').innerHTML = '<p>Sample Difficult Question</p>';

        // Find the top performer and the one needing attention
        const sortedAttempts = (data.last_attempts && Array.isArray(data.last_attempts)) ? 
        [...data.last_attempts].sort((a, b) => b.score - a.score) : [];
            
        const topPerformer = sortedAttempts.length > 0 ? sortedAttempts[0] : null;
        const needsAttention = sortedAttempts.length > 0 ? sortedAttempts[sortedAttempts.length - 1] : null;
        
      if(topPerformer) {
          document.getElementById('topPerformer').innerHTML = `<p>${topPerformer.user_id} <span>${(topPerformer.score * 100).toFixed(0)}%</span></p>`;
      }
      
      if(needsAttention) {
          document.getElementById('needsAttention').innerHTML = `<p>${needsAttention.user_id} <span>${(needsAttention.score * 100).toFixed(0)}%</span></p>`;
      }              
        // You can continue populating other sections similarly...

    } else {
        // Hide the detailed dashboard and show the "no quizzes" message

        if (emptyDash && fullDash) {
          fullDash.style.display = 'none';
          emptyDash.style.display = 'block';
        }
    }

    // UPCOMING CLASSES ON LEFT OF DASH
    const upcomingClassesContainer = document.getElementById('upcomingClasses');
    // Clear any existing listings (you might want to keep headers or static content)
    upcomingClassesContainer.innerHTML = '<p>Upcoming Classes</p>';

        // Check if data exists and has next_meetings
        if (data && data.next_meetings && data.next_meetings.length > 0) {
  
          data.next_meetings.forEach((meeting: Meeting) => {
            // Convert the timestamp string to a Date object
              const meetingDate = new Date(meeting.timestamp);
              const today = new Date();
  
              let dateString;
              if (meetingDate.toDateString() === today.toDateString()) {
                  dateString = `${meetingDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}, Today`;
              } else {
                  dateString = `${meetingDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}, ${meetingDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
              }
  
              // Construct the listing block for this meeting
              const meetingBlock = document.createElement('div');
              meetingBlock.classList.add('listingBlock', 'mt-3', 'mb-3');
  
              meetingBlock.innerHTML = `
                  <div class="d-flex justify-content-between align-items-center meeting-calendar-item">
                      <div>
                          <h5>${meeting.meeting_name}</h5>  <!-- Adjust this if you have a more appropriate title for the meeting -->
                          <p>${dateString}</p>
                      </div>
                      <a href="?m=${meeting.host_id}">(Start the Meeting)</a>
                  </div>
              `;
  
              upcomingClassesContainer.appendChild(meetingBlock);
          });
  
      } else {

        const meetingBlock = document.createElement('div');
        meetingBlock.classList.add('listingBlock', 'mt-3', 'mb-3');

        meetingBlock.innerHTML = `
            <div class="d-flex justify-content-between align-items-center meeting-calendar-item">
                <div>
                    <h5>No Meetings Yet</h5> 
                    <p>Schedule and make a meeting to begin.</p>
                </div>
            </div>
        `;

        upcomingClassesContainer.appendChild(meetingBlock);

          // Handle the case where there are no upcoming meetings, if needed
      }
  


  
  
  // Drew take 2 end





  this.enableLiveTranscription = false;
  this.noWordSeparatorForTranscription = false;
  this.updateLiveTranscriptionDisplayState();
  const token: string | null = localStorage.getItem('authToken');
  if (token) {
    const data = JSON.parse(localStorage.getItem('data') || '{}');

    if (data) {
        const firstName = data.first_name;
        const lastName = data.last_name;

        // Populate first name and last name
        document.getElementById('greetingFirstName').textContent = firstName;
        document.getElementById('dropdownFirstName').textContent = firstName;
        document.getElementById('dropdownLastName').textContent = lastName;
        document.getElementById('dropdownEmail').textContent = data.email;


        // If you have a list of students for "Completed" and "Did not complete", you'd loop through the data and create elements dynamically
    }


  } else {
      document.getElementById('login-container')!.style.display = 'block';
      document.getElementById('joining-page')!.style.display = 'none';
  }



function logout(): void {
  // localStorage.removeItem('authToken');
  // localStorage.removeItem('data');
  // remove all localstorage items:
  localStorage.clear();
  location.reload();
}
// if user clicks .logout button class, call logout function
document.querySelector('.logout')?.addEventListener('click', logout);

// if #join-view-only is clicked add "viewonly" to authToken, show #main-page and hide #login-container:
document.querySelector('#join-view-only')?.addEventListener('click', () => {
  alert("clicked view only");
  localStorage.setItem('authToken', 'viewonly');
  this.isViewOnly = true;
  document.getElementById('login-container')!.style.display = 'none';
  document.getElementById('main-page')!.style.display = 'block';
  this.switchToFlow('flow-meeting');
});


// END DREW LOGIN

// DREW REGISTRATION



// {/* VECTOR BUTTONS */}

// async function uploadPDF(pdfFile: File, userId: string): Promise<any> {
//     const formData = new FormData();
//     formData.append('pdf', pdfFile);
//     formData.append('user_id', userId);
//     // show spinner #uploadPDFBtn
//     const pdfspinner = document.getElementById('pdfspinner');
//     pdfspinner?.classList.add('d-none');

    
//     try {
//         const response = await fetch('https://app.larq.ai/api/Vectorize', {
//             method: 'POST',
//             body: formData,
//         });
        
//         const result = await response.json();
        
//         // Update the button text with the store_name from the response
//         if (result.status === "success" && result.vector_id) {
//             // hide spinner uploadPDFBtn
//             pdfspinner?.classList.remove('d-none');
//             document.getElementById('upload-alert')?.classList.add('d-none');
//             const uploadBtn = document.getElementById('uploadBtn');
//             const storeName = document.getElementById('store-name');
//             if (uploadBtn) {
//                 uploadBtn.textContent = result.store_name;
//                 uploadBtn.classList.add('btn btn-outline-success');
//                 storeName.innerText = result.store_name;
                
//             }
//             localStorage.setItem('storeName', result.store_name);
//             localStorage.setItem('vectorID', result.vector);
//         }
        
//         return result;
//     } catch (error) {
//         // hide spinner 
//         pdfspinner?.classList.remove('d-none');
//         console.error("Error uploading PDF:", error);
//         throw error;
//     }
// }

// // Add event listener to the upload button
// document.getElementById('uploadBtn')?.addEventListener('click', () => {
//     const pdfFile = (document.querySelector('#pdfInput') as HTMLInputElement).files![0];
//     const userId = localStorage.getItem('userId');
//     const uploadBtn = document.getElementById('uploadBtn');


//     if (pdfFile && userId) {
//         uploadPDF(pdfFile, userId)
//             .then(response => {
//                 console.log(response);
//                 uploadBtn.classList.add('btn-success');
//             })
//             .catch(error => {
//                 console.error(error);
//             });
//     } else {
//         console.warn("Please select a PDF file first. userId:", userId);
//         // make button glow and under it put the error:
//         const pdfalert = document.getElementById('pdf-alert');
//         uploadBtn?.classList.add('btn-danger');
//         uploadBtn?.classList.add('btn');
//         uploadBtn?.classList.add('text-white');
//         pdfalert?.classList.remove('d-none');

//     }
// });



// add a listener for #end-quiz-button that when clicked will set #quiz_in_progress to display none and #create-quiz to display block
document.querySelector('#end-quiz-button')?.addEventListener('click', () => {
  const quiz_in_progress = document.getElementById('quiz_in_progress');
  const create_quiz = document.getElementById('create-quiz');
  const end_quiz_modal = document.getElementById('end-quiz-modal');
  end_quiz_modal.classList.remove('show');
  if (quiz_in_progress && create_quiz) {
    quiz_in_progress.style.display = 'none';
    create_quiz.style.display = 'block';
  }
 
});



    // END QUIZBOT
    // *****************************
    // *****************************



    (document.getElementById('join-muted') as HTMLInputElement).addEventListener('change', e => {
      this.joinMuted = (e.target as HTMLInputElement).checked;
      if (this.joinMuted) {
        this.buttonStates['button-microphone'] = 'off';
      } else {
        this.buttonStates['button-microphone'] = 'on';
      }
    });

    if (this.defaultBrowserBehavior.hasFirefoxWebRTC()) {
      // Firefox currently does not support audio redundancy through insertable streams or
      // script transform so disable the redundancy checkbox
      (document.getElementById('disable-audio-redundancy') as HTMLInputElement).disabled = true;
      (document.getElementById('disable-audio-redundancy-checkbox') as HTMLElement).style.display = 'none';
    }

    
    if (!this.defaultBrowserBehavior.hasChromiumWebRTC()) {
      (document.getElementById('simulcast') as HTMLInputElement).disabled = true;
      document.getElementById('content-simulcast-config').style.display = 'none';
    }
    document.getElementById('join-view-only').addEventListener('change', () => {
      this.isViewOnly = (document.getElementById('join-view-only') as HTMLInputElement).checked;
    });

    document.getElementById('priority-downlink-policy').addEventListener('change', e => {
      this.usePriorityBasedDownlinkPolicy = (document.getElementById(
        'priority-downlink-policy'
      ) as HTMLInputElement).checked;

      const serverSideNetworkAdaption = document.getElementById(
        'server-side-network-adaption'
      ) as HTMLSelectElement;
      const paginationPageSize = document.getElementById('pagination-page-size') as HTMLElement;
      const paginationTitle = document.getElementById('pagination-title') as HTMLElement;
      const serverSideNetworkAdaptionTitle = document.getElementById(
        'server-side-network-adaption-title'
      ) as HTMLElement;

      if (this.usePriorityBasedDownlinkPolicy) {
        serverSideNetworkAdaption.style.display = 'block';
        paginationPageSize.style.display = 'block';
        paginationTitle.style.display = 'block';
        serverSideNetworkAdaptionTitle.style.display = 'block';
      } else {
        serverSideNetworkAdaption.style.display = 'none';
        paginationTitle.style.display = 'none';
        paginationPageSize.style.display = 'none';
        serverSideNetworkAdaptionTitle.style.display = 'none';
      }
    });

    const echoReductionCheckbox = document.getElementById(
      'echo-reduction-checkbox'
    ) as HTMLInputElement;
    (document.getElementById('webaudio') as HTMLInputElement).addEventListener('change', e => {
      this.enableWebAudio = (document.getElementById('webaudio') as HTMLInputElement).checked;
      if (this.enableWebAudio) {
        echoReductionCheckbox.style.display = 'block';
      } else {
        echoReductionCheckbox.style.display = 'none';
      }
    });

    const replicaMeetingInput = document.getElementById('replica-meeting-input');
    replicaMeetingInput.addEventListener('change', async _e => {
      (document.getElementById('primary-meeting-external-id') as HTMLInputElement).value = "";
    });

    document.getElementById('quick-join').addEventListener('click', e => {
      e.preventDefault();
      handleJoinAction();
      this.redirectFromAuthentication(true);
    });

    document.getElementById('form-authenticate').addEventListener('submit', e => {
      e.preventDefault();
      handleJoinAction();
      this.redirectFromAuthentication();
    });

    function handleJoinAction() {
      const meetingInput = document.getElementById('inputMeeting') as HTMLInputElement; // Cast to HTMLInputElement
      const meetingName = meetingInput.value; // Use .value to get input value
    
      // get userId from localstorage
      const userId = localStorage.getItem('userId');
      // Add other form data as needed
    
      fetch('https://app.larq.ai/api/scheduleMeeting', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              meeting_name: meetingName,
              host_id: userId,
              timestamp: Date.now(),
              duration: 60 // minutes
              // Add other meeting details
          }),
      })
      .then(response => response.json())
      .then(data => {
          if (data.status === 'success') {
              // Handle joining or starting the meeting (NEW MEETING)
              console.log(data.message);
              const meeting_id = data.meeting_id;
              // set localstorage "host_id" to data.host_id
              localStorage.setItem('host_id', data.host_id);
              localStorage.setItem('meeting_id', meeting_id);
              // Redirect to meeting page or perform other actions
          } else if (data.status === 'exists') {
              // Handle meeting already exists (JOIN MEETING)
              const meeting_id = data.meeting_id;
              console.log(data.message);
              localStorage.setItem('host_id', data.host_id);
              localStorage.setItem('meeting_id', meeting_id);
              // Redirect to meeting page or perform other actions
          }
          else {
              console.error(data.message);
          }
      })
      .catch(error => {
          console.error('Error:', error);
      });
    };
    

    const earlyConnectCheckbox = document.getElementById('preconnect') as HTMLInputElement;
    earlyConnectCheckbox.checked = SHOULD_EARLY_CONNECT;
    earlyConnectCheckbox.onchange = () => {
      SHOULD_EARLY_CONNECT = !!earlyConnectCheckbox.checked;
    }

    const dieCheckbox = document.getElementById('die') as HTMLInputElement;
    dieCheckbox.checked = SHOULD_DIE_ON_FATALS;
    dieCheckbox.onchange = () => {
      SHOULD_DIE_ON_FATALS = !!dieCheckbox.checked;
    }

    const speechMonoCheckbox = document.getElementById(
      'fullband-speech-mono-quality'
    ) as HTMLInputElement;
    const musicMonoCheckbox = document.getElementById(
      'fullband-music-mono-quality'
    ) as HTMLInputElement;
    const musicStereoCheckbox = document.getElementById(
      'fullband-music-stereo-quality'
    ) as HTMLInputElement;
    speechMonoCheckbox.addEventListener('change', _e => {
      if (speechMonoCheckbox.checked) {
        musicMonoCheckbox.checked = false;
        musicStereoCheckbox.checked = false;
      }
    });
    musicMonoCheckbox.addEventListener('change', _e => {
      if (musicMonoCheckbox.checked) {
        speechMonoCheckbox.checked = false;
        musicStereoCheckbox.checked = false;
      }
    });
    musicStereoCheckbox.addEventListener('change', _e => {
      if (musicStereoCheckbox.checked) {
        speechMonoCheckbox.checked = false;
        musicMonoCheckbox.checked = false;
        this.usingStereoMusicAudioProfile = true;
      } else {
        this.usingStereoMusicAudioProfile = false;
      }
    });

    document.getElementById('to-sip-flow').addEventListener('click', e => {
      e.preventDefault();
      this.switchToFlow('flow-sip-authenticate');
    });

    document.getElementById('form-sip-authenticate').addEventListener('submit', e => {
      e.preventDefault();
      this.meeting = (document.getElementById('sip-inputMeeting') as HTMLInputElement).value;
      this.voiceConnectorId = (document.getElementById(
        'voiceConnectorId'
      ) as HTMLInputElement).value;

      AsyncScheduler.nextTick(
        async (): Promise<void> => {
          this.showProgress('progress-authenticate');
          const region = this.region || 'us-east-1';
          try {
            const response = await fetch(
              `${DemoMeetingApp.BASE_URL}join?title=${encodeURIComponent(
                this.meeting
              )}&name=${encodeURIComponent(DemoMeetingApp.DID)}&region=${encodeURIComponent(
                region
              )}`,
              {
                method: 'POST',
              }
            );
            const json = await response.json();
            const joinToken = json.JoinInfo.Attendee.Attendee.JoinToken;
            this.sipURI = `sip:${DemoMeetingApp.DID}@${this.voiceConnectorId};transport=tls;X-joinToken=${joinToken}`;
            this.switchToFlow('flow-sip-uri');
          } catch (error) {
            (document.getElementById(
              'failed-meeting'
            ) as HTMLDivElement).innerText = `Meeting ID: ${this.meeting}`;
            (document.getElementById('failed-meeting-error') as HTMLDivElement).innerText =
              error.message;
            this.switchToFlow('flow-failed-meeting');
            return;
          }
          const sipUriElement = document.getElementById('sip-uri') as HTMLInputElement;
          sipUriElement.value = this.sipURI;
          this.hideProgress('progress-authenticate');
        }
      );
    });

    if (!this.areVideoFiltersSupported()) {
      document.getElementById('video-input-filter-container').style.display = 'none';
    }

    let videoInputFilter = document.getElementById('video-input-filter') as HTMLInputElement;
    videoInputFilter.addEventListener('change', async () => {
      this.selectedVideoFilterItem = <VideoFilterName>videoInputFilter.value;
      this.log(`Clicking video filter: ${this.selectedVideoFilterItem}`);
      await this.openVideoInputFromSelection(this.selectedVideoInput, true);
    });

    document.getElementById('copy-sip-uri').addEventListener('click', () => {
      const sipUriElement = document.getElementById('sip-uri') as HTMLInputElement;
      sipUriElement.select();
      document.execCommand('copy');
    });

    const audioInput = document.getElementById('audio-input') as HTMLSelectElement;
    audioInput.addEventListener('change', async (_ev: Event) => {
      this.log('audio input device is changed');
      await this.openAudioInputFromSelectionAndPreview();
    });

    const videoInput = document.getElementById('video-input') as HTMLSelectElement;
    videoInput.addEventListener('change', async (_ev: Event) => {
      this.log('video input device is changed');
      try {
        await this.openVideoInputFromSelection(videoInput.value, true);
      } catch (err) {
        fatal(err);
      }
    });

    const videoInputQuality = document.getElementById('video-input-quality') as HTMLSelectElement;
    videoInputQuality.addEventListener('change', async (_ev: Event) => {
      this.log('Video input quality is changed');
      switch (videoInputQuality.value) {
        case '360p':
          this.audioVideo.chooseVideoInputQuality(640, 360, 15);
          this.audioVideo.setVideoMaxBandwidthKbps(600);
          break;
        case '540p':
          this.audioVideo.chooseVideoInputQuality(960, 540, 15);
          this.audioVideo.setVideoMaxBandwidthKbps(1400);
          break;
        case '720p':
          this.audioVideo.chooseVideoInputQuality(1280, 720, 15);
          this.audioVideo.setVideoMaxBandwidthKbps(1500);
          break;
      }
      try {
        if (this.chosenVideoTransformDevice) {
          await this.chosenVideoTransformDevice.stop();
          this.chosenVideoTransformDevice = null;
        }
        await this.openVideoInputFromSelection(videoInput.value, true);
      } catch (err) {
        fatal(err);
      }
    });

    const audioOutput = document.getElementById('audio-output') as HTMLSelectElement;
    audioOutput.addEventListener('change', async (_ev: Event) => {
      this.log('audio output device is changed');
      await this.openAudioOutputFromSelection();
    });

    document.getElementById('button-test-sound').addEventListener('click', async e => {
      e.preventDefault();
      const audioOutput = document.getElementById('audio-output') as HTMLSelectElement;
      const testSound = new TestSound(this.meetingEventPOSTLogger, audioOutput.value);
      await testSound.init();
    });

    document.getElementById('form-devices').addEventListener('submit', e => {
      e.preventDefault();
   
      AsyncScheduler.nextTick(async () => {
        try {
          this.showProgress('progress-join');
          await this.stopAudioPreview();
          await this.openVideoInputFromSelection(null, true);
          // stopVideoProcessor should be called before join; it ensures that state variables and video processor stream are cleaned / removed before joining the meeting.
          // If stopVideoProcessor is not called then the state from preview screen will be carried into the in meeting experience and it will cause undesired side effects.
          await this.stopVideoProcessor();
          await this.join();
          this.hideProgress('progress-join');
          this.displayButtonStates();
          this.switchToFlow('flow-meeting');
        } catch (error) {
          document.getElementById('failed-join').innerText = `Meeting ID: ${this.meeting}`;
          document.getElementById('failed-join-error').innerText = `Error: ${error.message}`;
        }
      });
    });

    (document.getElementById('add-voice-focus') as HTMLInputElement).addEventListener(
      'change',
      e => {
        this.enableVoiceFocus = (e.target as HTMLInputElement).checked;
        this.onVoiceFocusSettingChanged();
      }
    );

    const buttonMute = document.getElementById('button-microphone');
    buttonMute.addEventListener('click', _e => {
      this.toggleButton('button-microphone');
      if (this.isButtonOn('button-microphone')) {
        this.audioVideo.realtimeUnmuteLocalAudio();
      } else {
        this.audioVideo.realtimeMuteLocalAudio();
      }
    });

    const buttonCloudCapture = document.getElementById('button-record-cloud') as HTMLButtonElement;
    buttonCloudCapture.addEventListener('click', _e => {
      this.toggleButton('button-record-cloud');
      this.updateButtonVideoRecordingDrop();
      if (this.isButtonOn('button-record-cloud')) {
        AsyncScheduler.nextTick(async () => {
          buttonCloudCapture.disabled = true;
          await this.startMediaCapture();
          buttonCloudCapture.disabled = false;
        });
      } else {
        AsyncScheduler.nextTick(async () => {
          buttonCloudCapture.disabled = true;
          await this.stopMediaCapture();
          buttonCloudCapture.disabled = false;
        });
      }
    });

    const buttonLiveConnector = document.getElementById(
      'button-live-connector'
    ) as HTMLButtonElement;
    buttonLiveConnector.addEventListener('click', _e => {
      this.toggleButton('button-live-connector');
      this.updateButtonVideoRecordingDrop();
      if (this.isButtonOn('button-live-connector')) {
        AsyncScheduler.nextTick(async () => {
          buttonLiveConnector.disabled = true;
          const response = await this.startLiveConnector();
          const toastContainer = document.getElementById('toast-container');
          const toast = document.createElement('meeting-toast') as MeetingToast;
          toastContainer.appendChild(toast);
          toast.message = 'Playback URL: ' + response.playBackUrl;
          toast.delay = '50000';
          toast.show();
          buttonLiveConnector.disabled = false;
        });
      } else {
        AsyncScheduler.nextTick(async () => {
          buttonLiveConnector.disabled = true;
          await this.stopLiveConnector();
          buttonLiveConnector.disabled = false;
        });
      }
    });

    const buttonRecordSelf = document.getElementById('button-record-self');
    let recorder: MediaRecorder;
    buttonRecordSelf.addEventListener('click', _e => {
      const chunks: Blob[] = [];
      AsyncScheduler.nextTick(async () => {
        this.toggleButton('button-record-self');
        this.updateButtonVideoRecordingDrop();
        if (!this.isButtonOn('button-record-self')) {
          console.info('Stopping recorder ', recorder);
          recorder.stop();
          recorder = undefined;
          return;
        }

        // Combine the audio and video streams.
        const mixed = new MediaStream();

        const localTile = this.audioVideo.getLocalVideoTile();
        if (localTile) {
          mixed.addTrack(localTile.state().boundVideoStream.getVideoTracks()[0]);
        }

        // We need to get access to the media stream broker, which requires knowing
        // the exact implementation. Sorry!
        /* @ts-ignore */
        const av: DefaultAudioVideoController = this.audioVideo.audioVideoController;
        const input = await av.mediaStreamBroker.acquireAudioInputStream();
        mixed.addTrack(input.getAudioTracks()[0]);

        recorder = new MediaRecorder(mixed, { mimeType: 'video/webm; codecs=vp9' });
        console.info('Setting recorder to', recorder);
        recorder.ondataavailable = (event) => {
          if (event.data.size) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, {
            type: 'video/webm',
          });
          chunks.length = 0;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          document.body.appendChild(a);
          /* @ts-ignore */
          a.style = 'display: none';
          a.href = url;
          a.download = 'recording.webm';
          a.click();
          window.URL.revokeObjectURL(url);
        };

        recorder.start();
      });
    });

    const buttonVideo = document.getElementById('button-camera');
    buttonVideo.addEventListener('click', _e => {
      AsyncScheduler.nextTick(async () => {
        if (this.toggleButton('button-camera') === 'on' && this.canStartLocalVideo) {
          try {
            let camera: string | null = this.selectedVideoInput;
            if (camera === null || camera === 'None') {
              camera = this.cameraDeviceIds.length ? this.cameraDeviceIds[0] : 'None';
            }
            await this.openVideoInputFromSelection(camera, false);
            this.audioVideo.startLocalVideoTile();
          } catch (err) {
            this.toggleButton('button-camera', 'off')
            fatal(err);
          }
        } else {
          await this.audioVideo.stopVideoInput();
          this.toggleButton('button-camera', 'off');
        }
      });
    });

    const buttonSpeaker = document.getElementById('button-speaker');
    buttonSpeaker.addEventListener('click', _e => {
      AsyncScheduler.nextTick(async () => {
        this.toggleButton('button-speaker');
        if (this.isButtonOn('button-speaker')) {
          try {
            await this.audioVideo.bindAudioElement(
              document.getElementById('meeting-audio') as HTMLAudioElement
            );
          } catch (e) {
            fatal(e);
            this.log('Failed to bindAudioElement', e);
          }
        } else {
          this.audioVideo.unbindAudioElement();
        }
      });
    });

    const buttonLiveTranscription = document.getElementById('button-live-transcription');
    buttonLiveTranscription.addEventListener('click', () => {
      this.transcriptContainerDiv.style.display = this.isButtonOn('button-live-transcription')
        ? 'none'
        : 'block';
      this.toggleButton('button-live-transcription');
    });

    const buttonLiveTranscriptionModal = document.getElementById(
      'button-live-transcription-modal-close'
    );
    buttonLiveTranscriptionModal.addEventListener('click', () => {
      document.getElementById('live-transcription-modal').style.display = 'none';
    });

    // show only languages available to selected transcription engine
    document.getElementsByName('transcription-engine').forEach(e => {
      e.addEventListener('change', () => {
        const engineTranscribeChecked = (document.getElementById(
          'engine-transcribe'
        ) as HTMLInputElement).checked;
        const contentIdentificationChecked = (document.getElementById(
          'content-identification-checkbox'
        ) as HTMLInputElement).checked;
        const contentRedactionChecked = (document.getElementById(
          'content-redaction-checkbox'
        ) as HTMLInputElement).checked;
        document
          .getElementById('engine-transcribe-language')
          .classList.toggle('hidden', !engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-medical-language')
          .classList.toggle('hidden', engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-region')
          .classList.toggle('hidden', !engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-medical-region')
          .classList.toggle('hidden', engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-medical-content-identification')
          .classList.toggle('hidden', engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-language-identification')
          .classList.toggle('hidden', !engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-content-identification')
          .classList.toggle('hidden', !engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-redaction')
          .classList.toggle('hidden', !engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-partial-stabilization')
          .classList.toggle('hidden', !engineTranscribeChecked);
        document
          .getElementById('engine-transcribe-custom-language-model')
          .classList.toggle('hidden', !engineTranscribeChecked);
        if (!engineTranscribeChecked) {
          document.getElementById('transcribe-entity-types').classList.toggle('hidden', true);
        } else if (
          engineTranscribeChecked &&
          (contentIdentificationChecked || contentRedactionChecked)
        ) {
          document.getElementById('transcribe-entity-types').classList.toggle('hidden', false);
        }
      });
    });

    const languageIdentificationCb = document.getElementById(
      'identify-language-checkbox'
    ) as HTMLInputElement;
    languageIdentificationCb.addEventListener('click', () => {
      (document.getElementById('button-start-transcription') as HTMLInputElement).disabled =
        languageIdentificationCb.checked;
      document
        .getElementById('language-options')
        .classList.toggle('hidden', !languageIdentificationCb.checked);
      document
        .getElementById('preferred-language')
        .classList.toggle('hidden', !languageIdentificationCb.checked);
      document
        .getElementById('vocabulary-names')
        .classList.toggle('hidden', !languageIdentificationCb.checked);
      document
        .getElementById('vocabulary-filter-names')
        .classList.toggle('hidden', !languageIdentificationCb.checked);
      (document.getElementById('transcribe-language') as HTMLInputElement).disabled =
        languageIdentificationCb.checked;
      (document.getElementById('content-identification-checkbox') as HTMLInputElement).disabled =
        languageIdentificationCb.checked;
      (document.getElementById('content-redaction-checkbox') as HTMLInputElement).disabled =
        languageIdentificationCb.checked;
      (document.getElementById('custom-language-model-checkbox') as HTMLInputElement).disabled =
        languageIdentificationCb.checked;
      (document.getElementById('transcribe-entity') as HTMLInputElement).disabled =
        languageIdentificationCb.checked;
      (document.getElementById('language-model-input-text') as HTMLInputElement).disabled =
        languageIdentificationCb.checked;
    });

    const languageOptionsDropDown = document.getElementById('language-options') as HTMLInputElement;
    languageOptionsDropDown.addEventListener('change', event =>
      languageOptionsDropDownClickHandler(event)
    );

    const contentIdentificationCb = document.getElementById(
      'content-identification-checkbox'
    ) as HTMLInputElement;
    contentIdentificationCb.addEventListener('click', () => {
      (document.getElementById('content-redaction-checkbox') as HTMLInputElement).disabled =
        contentIdentificationCb.checked;
      (document.getElementById('transcribe-entity-types') as HTMLInputElement).classList.toggle(
        'hidden',
        !contentIdentificationCb.checked
      );
    });

    const contentRedactionCb = document.getElementById(
      'content-redaction-checkbox'
    ) as HTMLInputElement;
    contentRedactionCb.addEventListener('click', () => {
      (document.getElementById('content-identification-checkbox') as HTMLInputElement).disabled =
        contentRedactionCb.checked;
      (document.getElementById('transcribe-entity-types') as HTMLInputElement).classList.toggle(
        'hidden',
        !contentRedactionCb.checked
      );
    });

    const partialResultsStabilityCb = document.getElementById(
      'partial-stabilization-checkbox'
    ) as HTMLInputElement;
    partialResultsStabilityCb.addEventListener('click', () => {
      document
        .getElementById('transcribe-partial-stability')
        .classList.toggle('hidden', !partialResultsStabilityCb.checked);
    });

    const languageModelCb = document.getElementById(
      'custom-language-model-checkbox'
    ) as HTMLInputElement;
    languageModelCb.addEventListener('click', () => {
      document
        .getElementById('language-model')
        .classList.toggle('hidden', !languageModelCb.checked);
    });

    const buttonStartTranscription = document.getElementById('button-start-transcription');
    buttonStartTranscription.addEventListener('click', async () => {
      let engine = '';
      let languageCode = '';
      let region = '';
      const transcriptionStreamParams: TranscriptionStreamParams = {};
      if ((document.getElementById('engine-transcribe') as HTMLInputElement).checked) {
        engine = 'transcribe';
        region = (document.getElementById('transcribe-region') as HTMLInputElement).value;

        if (!isChecked('identify-language-checkbox')) {
          languageCode = (document.getElementById('transcribe-language') as HTMLInputElement).value;

          if (isChecked('content-identification-checkbox')) {
            transcriptionStreamParams.contentIdentificationType = 'PII';
          }

          if (isChecked('content-redaction-checkbox')) {
            transcriptionStreamParams.contentRedactionType = 'PII';
          }

          if (
            isChecked('content-identification-checkbox') ||
            isChecked('content-redaction-checkbox')
          ) {
            let piiEntityTypes = getSelectedValues('#transcribe-entity');
            if (piiEntityTypes !== '') {
              transcriptionStreamParams.piiEntityTypes = piiEntityTypes;
            }
          }

          if (isChecked('custom-language-model-checkbox')) {
            let languageModelName = (document.getElementById(
              'language-model-input-text'
            ) as HTMLInputElement).value;
            if (languageModelName) {
              transcriptionStreamParams.languageModelName = languageModelName;
            }
          }
        }

        if (isChecked('identify-language-checkbox')) {
          transcriptionStreamParams.identifyLanguage = true;
          const languageOptionsSelected = getSelectedValues('#language-options');
          if (languageOptionsSelected !== '') {
            transcriptionStreamParams.languageOptions = languageOptionsSelected;
          }

          const preferredLanguageSelected = (document.getElementById(
            'preferred-language-selection'
          ) as HTMLInputElement).value;
          if (preferredLanguageSelected) {
            transcriptionStreamParams.preferredLanguage = preferredLanguageSelected;
          }

          const vocabularyNames = (document.getElementById(
            'vocabulary-names-input-text'
          ) as HTMLInputElement).value;
          if (vocabularyNames) {
            transcriptionStreamParams.vocabularyNames = vocabularyNames;
          }

          const vocabularyFilterNames = (document.getElementById(
            'vocabulary-filter-names-input-text'
          ) as HTMLInputElement).value;
          if (vocabularyFilterNames) {
            transcriptionStreamParams.vocabularyFilterNames = vocabularyFilterNames;
          }
        }

        if (isChecked('partial-stabilization-checkbox')) {
          transcriptionStreamParams.enablePartialResultsStability = true;
        }

        let partialResultsStability = (document.getElementById(
          'partial-stability'
        ) as HTMLInputElement).value;
        if (partialResultsStability) {
          transcriptionStreamParams.partialResultsStability = partialResultsStability;
        }
      } else if (
        (document.getElementById('engine-transcribe-medical') as HTMLInputElement).checked
      ) {
        engine = 'transcribe_medical';
        languageCode = (document.getElementById('transcribe-medical-language') as HTMLInputElement)
          .value;
        region = (document.getElementById('transcribe-medical-region') as HTMLInputElement).value;
        if (isChecked('medical-content-identification-checkbox')) {
          transcriptionStreamParams.contentIdentificationType = 'PHI';
        }
      } else {
        throw new Error('Unknown transcription engine');
      }
      await startLiveTranscription(engine, languageCode, region, transcriptionStreamParams);
    });

    function isChecked(id: string): boolean {
      return (document.getElementById(id) as HTMLInputElement).checked;
    }

    // fetches checked values of the list from given selector id
    function getSelectedValues(id: string): string {
      let selectors = id + ' ' + 'option:checked';
      const selectedValues = document.querySelectorAll(selectors);
      let values = '';
      if (selectedValues.length > 0) {
        values = Array.from(selectedValues)
          .filter(node => (node as HTMLInputElement).value !== '')
          .map(el => (el as HTMLInputElement).value)
          .join(',');
      }
      return values;
    }

    function createErrorSpan(message: string): void {
      let languageOptionsErrorSpan = document.createElement('span');
      languageOptionsErrorSpan.innerText = message;
      languageOptionsErrorSpan.classList.add('error-message-color');
      document
        .getElementById('language-options-error-message')
        .appendChild(languageOptionsErrorSpan);
      (document.getElementById('button-start-transcription') as HTMLInputElement).disabled = true;
    }

    // callback to restrict users from selecting multiple language variant (locale) per language code
    // e.g. en-US and en-AU as language options cannot be selected for the same transcription
    // Details in https://docs.aws.amazon.com/transcribe/latest/dg/lang-id-stream.html
    function languageOptionsDropDownClickHandler(event: Event): boolean {
      let languageGroupSet = new Set();
      document.getElementById('language-options-error-message').innerHTML = '';
      const languageOptionsSelected = document.querySelectorAll('#language-options option:checked');

      const languageOptionsPreviewSpan = document.getElementById(
        'language-options-selected-options'
      );
      const languageString =
        languageOptionsSelected.length === 0
          ? 'None'
          : Array.from(languageOptionsSelected)
              .map((node: HTMLSelectElement) => node.value)
              .join(',')
              .trim();
      languageOptionsPreviewSpan.innerText = languageString;

      let preferredLanguageDropDown = document.getElementById('preferred-language-selection');
      if (preferredLanguageDropDown.hasChildNodes) {
        let options = (preferredLanguageDropDown as HTMLSelectElement).options;
        for (let i = options.length - 1; i >= 0; i--) {
          if (options[i].value.length > 0) {
            preferredLanguageDropDown.removeChild(options[i]);
          }
        }
      }

      for (let i = languageOptionsSelected.length - 1; i >= 0; i--) {
        let currentItem = languageOptionsSelected.item(i) as HTMLSelectElement;
        if (languageGroupSet.has(currentItem.parentElement.id)) {
          createErrorSpan('Please select one language per group');
          return false;
        }
        languageGroupSet.add(currentItem.parentElement.id);
        let selectedValue = currentItem.value;
        let option = document.createElement('option');
        option.value = selectedValue;
        option.text = currentItem.innerText;
        document.getElementById('preferred-language-selection').appendChild(option);
      }

      if (languageOptionsSelected.length < 2) {
        createErrorSpan('Please select at least 2 language options');
        return false;
      } else if (languageOptionsSelected.length >= 2) {
        (document.getElementById(
          'button-start-transcription'
        ) as HTMLInputElement).disabled = false;
      }
    }
    const startLiveTranscription = async (
      engine: string,
      languageCode: string,
      region: string,
      transcriptionStreamParams: TranscriptionStreamParams
    ) => {
      const transcriptionAdditionalParams = JSON.stringify(transcriptionStreamParams);
      const response = await fetch(
        `${DemoMeetingApp.BASE_URL}start_transcription?title=${encodeURIComponent(
          this.meeting
        )}&engine=${encodeURIComponent(engine)}&language=${encodeURIComponent(
          languageCode
        )}&region=${encodeURIComponent(region)}&transcriptionStreamParams=${encodeURIComponent(
          transcriptionAdditionalParams
        )}`,
        {
          method: 'POST',
        }
      );
      const json = await response.json();
      if (json.error) {
        throw new Error(`Server error: ${json.error}`);
      }
      document.getElementById('live-transcription-modal').style.display = 'none';
    };

    const buttonVideoStats = document.getElementById('button-video-stats');
    buttonVideoStats.addEventListener('click', () => {
      if (this.isButtonOn('button-video-stats')) {
        document.querySelectorAll('.stats-info').forEach(e => e.remove());
      } else {
        this.getRelayProtocol();
      }
      this.toggleButton('button-video-stats');
    });

    const buttonPromoteToPrimary = document.getElementById('button-promote-to-primary');
    buttonPromoteToPrimary.addEventListener('click', async () => {
      if (!this.isButtonOn('button-promote-to-primary')) {
        await this.promoteToPrimaryMeeting();
      } else {
        this.meetingLogger.info('Demoting from primary meeting');
        if (this.deleteOwnAttendeeToLeave) {
          this.deleteAttendee(
            this.primaryExternalMeetingId,
            this.primaryMeetingSessionCredentials?.attendeeId
          );
        } else {
          this.audioVideo.demoteFromPrimaryMeeting();
        }
        // `audioVideoWasDemotedFromPrimaryMeeting` will adjust UX
      }
    });

    const sendMessage = (): void => {
      AsyncScheduler.nextTick(() => {
        const textArea = document.getElementById('send-message') as HTMLTextAreaElement;
        const textToSend = textArea.value.trim();
        if (!textToSend) {
          return;
        }
        textArea.value = '';
        this.audioVideo.realtimeSendDataMessage(
          DemoMeetingApp.DATA_MESSAGE_TOPIC,
          textToSend,
          DemoMeetingApp.DATA_MESSAGE_LIFETIME_MS
        );
        // echo the message to the handler
        this.dataMessageHandler(
          new DataMessage(
            Date.now(),
            DemoMeetingApp.DATA_MESSAGE_TOPIC,
            new TextEncoder().encode(textToSend),
            this.meetingSession.configuration.credentials.attendeeId,
            this.meetingSession.configuration.credentials.externalUserId
          )
        );
      });
    };

    const textAreaSendMessage = document.getElementById('send-message') as HTMLTextAreaElement;
    textAreaSendMessage.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          textAreaSendMessage.rows++;
        } else {
          e.preventDefault();
          sendMessage();
          textAreaSendMessage.rows = 1;
        }
      }
    });
    

    
    const textAreaSendForumMessage = document.getElementById('forumContainer') as HTMLTextAreaElement;
    // const queries_block = document.getElementById('queries-block2') as HTMLTextAreaElement;
    textAreaSendForumMessage.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          textAreaSendForumMessage.rows++;
        } else {
          e.preventDefault();
          const textArea = document.getElementById('forumContainer') as HTMLTextAreaElement;
          const textToSend = textArea.value.trim();
          const messageObject = {
            message: textToSend,
            userId: window.demoMeetingAppInstance.meetingSession.configuration.credentials.attendeeId,
            time: Date.now(),
            selfID: window.demoMeetingAppInstance.meetingSession.configuration.credentials.attendeeId,
            selfName: window.demoMeetingAppInstance.meetingSession.configuration.credentials.attendeeId.split('#').slice(-1)[0]
          };
          // alert("messageObject : " + JSON.stringify(messageObject));
          window.demoMeetingAppInstance.sendForumMessage(messageObject);
          textAreaSendForumMessage.rows = 1;
          // queries_block.innerHTML += `<div class="list-group receive-message" style="flex: 1 1 auto; overflow-y: auto; border: 1px solid rgba(0, 0, 0, 0.125); background-color: #fff"><div class="message-bubble-sender">Me</div><div class="message-bubble-self"><p class="markdown">${textAreaSendForumMessage.value.trim()}</p></div></div>`;
          // queries_block.innerHTML += `<div class="message-bubble-sender">Me</div><div class="message-bubble-self"><p class="markdown">${textAreaSendForumMessage.value.trim()}</p></div>`;
          // textArea.value = '';
        }
      }
    });
    // const textAreaSendForumMessage2 = document.getElementById('queries-block2') as HTMLTextAreaElement;
    // textAreaSendForumMessage2.addEventListener('keydown', e => {
    //   if (e.keyCode === 13) {
    //     if (e.shiftKey) {
    //       textAreaSendForumMessage2.rows++;
    //     } else {
    //       e.preventDefault();
    //       sendForumMessage(userId);
    //       textAreaSendForumMessage2.rows = 1;
    //     }
    //   }
    // });


    const buttonMeetingEnd = document.getElementById('button-meeting-end');
    buttonMeetingEnd.addEventListener('click', _e => {
      const confirmEnd = new URL(window.location.href).searchParams.get('confirm-end') === 'true';
      const prompt =
        'Are you sure you want to end the meeting for everyone? The meeting cannot be used after ending it.';
      if (confirmEnd && !window.confirm(prompt)) {
        return;
      }
      AsyncScheduler.nextTick(async () => {
        (buttonMeetingEnd as HTMLButtonElement).disabled = true;
        await this.endMeeting();
        await this.leave();
        (buttonMeetingEnd as HTMLButtonElement).disabled = false;
      });
    });

    const buttonMeetingLeave = document.getElementById('button-meeting-leave');
    buttonMeetingLeave.addEventListener('click', e => {
      if (e.shiftKey) {
        this.behaviorAfterLeave = 'halt';
      }
      AsyncScheduler.nextTick(async () => {
        (buttonMeetingLeave as HTMLButtonElement).disabled = true;
        await this.leave();
        (buttonMeetingLeave as HTMLButtonElement).disabled = false;
      });
    });
  }

  logAudioStreamPPS(clientMetricReport: ClientMetricReport) {
    const { currentTimestampMs, previousTimestampMs } = clientMetricReport;
    const deltaTime = currentTimestampMs - previousTimestampMs;
    const rtcStatsReport = clientMetricReport.getRTCStatsReport();

    rtcStatsReport.forEach(report => {
      if (report.type === 'outbound-rtp' && report.kind === 'audio') {
        // Skip initial metric.
        if (report.packetsSent === 0 && previousTimestampMs === 0) return;

        const deltaPackets = report.packetsSent - this.lastPacketsSent;
        const pps = (1000 * deltaPackets) / deltaTime;

        let overage = 0;
        if ((pps > 52) || (pps < 47)) {
          console.error('PPS:', pps, `(${++overage})`);
        } else {
          overage = 0;
          console.debug('PPS:', pps);
        }
        this.lastPacketsSent = report.packetsSent;
      }
    });
  }
  logRedRecoveryPercent(clientMetricReport: ClientMetricReport) {
    const customStatsReports = clientMetricReport.customStatsReports;

    // @ts-ignore
    customStatsReports.forEach(report => {
      if (report.type === 'inbound-rtp-red' && report.kind === 'audio') {

        const deltaExpected = report.totalAudioPacketsExpected - this.lastTotalAudioPacketsExpected;
        const deltaLost = report.totalAudioPacketsLost - this.lastTotalAudioPacketsLost;
        const deltaRedRecovered = report.totalAudioPacketsRecoveredRed - this.lastTotalAudioPacketsRecoveredRed;
        const deltaFecRecovered = report.totalAudioPacketsRecoveredFec - this.lastTotalAudioPacketsRecoveredFec;
        if (this.lastRedRecoveryMetricsReceived === 0) this.lastRedRecoveryMetricsReceived = report.timestamp;
        const deltaTime = report.timestamp - this.lastRedRecoveryMetricsReceived;
        this.lastRedRecoveryMetricsReceived = report.timestamp;
        this.lastTotalAudioPacketsExpected = report.totalAudioPacketsExpected;
        this.lastTotalAudioPacketsLost = report.totalAudioPacketsLost;
        this.lastTotalAudioPacketsRecoveredRed = report.totalAudioPacketsRecoveredRed;
        this.lastTotalAudioPacketsRecoveredFec = report.totalAudioPacketsRecoveredFec;

        let lossPercent = 0;
        if (deltaExpected > 0) {
          lossPercent = 100 * (deltaLost / deltaExpected);
        }
        let redRecoveryPercent = 0;
        let fecRecoveryPercent = 0;
        if (deltaLost > 0) {
          redRecoveryPercent = 100 * (deltaRedRecovered / deltaLost);
          fecRecoveryPercent = 100 * (deltaFecRecovered / deltaLost);
        }
        console.debug(`[AudioRed] time since last report = ${deltaTime/1000}s, loss % = ${lossPercent}, red recovery % = ${redRecoveryPercent}, fec recovery % = ${fecRecoveryPercent}, total expected = ${report.totalAudioPacketsExpected}, total lost = ${report.totalAudioPacketsLost}, total red recovered  = ${report.totalAudioPacketsRecoveredRed}, total fec recovered = ${report.totalAudioPacketsRecoveredFec}`);
      }
    });
  }



  getSupportedMediaRegions(): string[] {
    const supportedMediaRegions: string[] = [];
    const mediaRegion = document.getElementById('inputRegion') as HTMLSelectElement;
    for (let i = 0; i < mediaRegion.length; i++) {
      supportedMediaRegions.push(mediaRegion.value);
    }
    return supportedMediaRegions;
  }

  async getNearestMediaRegion(): Promise<string> {
    const nearestMediaRegionResponse = await fetch(`https://nearest-media-region.l.chime.aws`, {
      method: 'GET',
    });
    const nearestMediaRegionJSON = await nearestMediaRegionResponse.json();
    const nearestMediaRegion = nearestMediaRegionJSON.region;
    return nearestMediaRegion;
  }

  setMediaRegion(): void {
    AsyncScheduler.nextTick(
      async (): Promise<void> => {
        try {
          const query = new URLSearchParams(document.location.search);
          const region = query.get('region');
          const nearestMediaRegion = region ? region : await this.getNearestMediaRegion();
          if (nearestMediaRegion === '' || nearestMediaRegion === null) {
            throw new Error('Nearest Media Region cannot be null or empty');
          }
          const supportedMediaRegions: string[] = this.getSupportedMediaRegions();
          if (supportedMediaRegions.indexOf(nearestMediaRegion) === -1) {
            supportedMediaRegions.push(nearestMediaRegion);
            const mediaRegionElement = document.getElementById('inputRegion') as HTMLSelectElement;
            const newMediaRegionOption = document.createElement('option');
            newMediaRegionOption.value = nearestMediaRegion;
            newMediaRegionOption.text = nearestMediaRegion + ' (' + nearestMediaRegion + ')';
            mediaRegionElement.add(newMediaRegionOption, null);
          }
          (document.getElementById('inputRegion') as HTMLInputElement).value = nearestMediaRegion;
        } catch (error) {
          fatal(error);
          this.log('Default media region selected: ' + error.message);
        }
      }
    );
  }

  async promoteToPrimaryMeeting() {
    this.meetingLogger.info('Attempting to promote self to primary meeting from replica');

    if (this.primaryMeetingSessionCredentials === undefined) {
      this.primaryMeetingSessionCredentials = await this.getPrimaryMeetingCredentials();
    }
    await this.audioVideo
      .promoteToPrimaryMeeting(this.primaryMeetingSessionCredentials)
        .then((status) => {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('meeting-toast') as MeetingToast;
        toastContainer.appendChild(toast);
        if (status.isFailure()) {
          toast.message = ` Failed to promote to primary meeting due to error: ${status.toString()}`;
          toast.addButton('Retry', () => {
            this.promoteToPrimaryMeeting();
          });
        } else {
          toast.message = `Successfully promoted to primary meeting`;
          this.updateUXForReplicaMeetingPromotionState('promoted');
        }
        toast.show();
      });
  }

  private async getPrimaryMeetingCredentials(): Promise<MeetingSessionCredentials> {
    // Use the same join endpoint, but point it to the provided primary meeting title and give us an arbitrarily different user name
    const joinInfo = (
      await this.sendJoinRequest(
        this.primaryExternalMeetingId,
        `promoted-${this.name}`,
        this.region,
        undefined,
        this.audioCapability,
        this.videoCapability,
        this.contentCapability
      )
    ).JoinInfo;
    // To avoid duplicating code we reuse the constructor for `MeetingSessionConfiguration` which contains `MeetingSessionCredentials`
    // within it and properly does the parsing of the `chime::CreateAttendee` response
    const configuration = new MeetingSessionConfiguration(joinInfo.Meeting, joinInfo.Attendee);
    return configuration.credentials;
  }

  updateUXForViewOnlyMode() {
    for (const button in this.buttonStates) {
      if (
        button === 'button-speaker' ||
        button === 'button-video-stats' ||
        button === 'button-live-transcription'
      ) {
        continue;
      }
      this.toggleButton(button, 'disabled');
    }

    // Mute since we use dummy audio
    this.audioVideo.realtimeMuteLocalAudio();
  }

  updateUXForReplicaMeetingPromotionState(promotedState: 'promoted' | 'demoted') {
    const isPromoted = promotedState === 'promoted';

    // Enable/disable buttons as appropriate
    for (const button in this.buttonStates) {
      if (
        button === 'button-speaker' ||
        button === 'button-video-stats' ||
        button === 'button-live-transcription'
      ) {
        continue;
      }

      if (button === 'button-promote-to-primary') {
        // Don't disable promotion button
        this.meetingLogger.info(`promote button ${isPromoted ? 'on' : 'off'}`);
        this.toggleButton(button, isPromoted ? 'on' : 'off');
        continue;
      }

      this.toggleButton(button, isPromoted ? 'off' : 'disabled');
    }

    // Additionally mute audio so it's not in an unexpected state when demoted
    if (!isPromoted) {
      this.audioVideo.realtimeMuteLocalAudio();
    }
  }

  setButtonVisibility(button: string, visible: boolean, state?: ButtonState) {
    const element = document.getElementById(button);
    element.style.display = visible ? 'inline-block' : 'none';
    this.toggleButton(button, state);
  }

  toggleButton(button: string, state?: ButtonState): ButtonState {
    if (state) {
      this.buttonStates[button] = state;
    } else if (this.buttonStates[button] === 'on') {
      this.buttonStates[button] = 'off';
    } else {
      this.buttonStates[button] = 'on';
    }
    this.displayButtonStates();
    return this.buttonStates[button];
  }

  isButtonOn(button: string): boolean {
    return this.buttonStates[button] === 'on';
  }

  updateButtonVideoRecordingDrop(): void {
    if (
      this.buttonStates['button-record-self'] === 'on' ||
      this.buttonStates['button-record-cloud'] === 'on' ||
      this.buttonStates['button-live-connector'] === 'on'
    ) {
      this.buttonStates['button-video-recording-drop'] = 'on';
    } else if (
      this.buttonStates['button-record-self'] === 'off' &&
      this.buttonStates['button-record-cloud'] === 'off' &&
      this.buttonStates['button-live-connector'] === 'off'
    ) {
      this.buttonStates['button-video-recording-drop'] = 'off';
    }
    this.displayButtonStates();
  }

  displayButtonStates(): void {
    for (const button in this.buttonStates) {
      const element = document.getElementById(button);
      const drop = document.getElementById(`${button}-drop`);
      const on = this.isButtonOn(button);
      element.classList.add(on ? 'btn-success' : 'btn-outline-secondary');
      element.classList.remove(on ? 'btn-outline-secondary' : 'btn-success');
      (element.firstElementChild as SVGElement).classList.add(on ? 'svg-active' : 'svg-inactive');
      (element.firstElementChild as SVGElement).classList.remove(
        on ? 'svg-inactive' : 'svg-active'
      );
      if (this.buttonStates[button] === 'disabled') {
        element.setAttribute('disabled', '');
      } else {
        element.removeAttribute('disabled');
      }
      if (drop) {
        drop.classList.add(on ? 'btn-success' : 'btn-outline-secondary');
        drop.classList.remove(on ? 'btn-outline-secondary' : 'btn-success');
        if (this.buttonStates[button] === 'disabled') {
          drop.setAttribute('disabled', '');
        } else {
          drop.removeAttribute('disabled');
        }
      }
    }
  }

  showProgress(id: string): void {
    (document.getElementById(id) as HTMLDivElement).style.visibility = 'visible';
  }

  hideProgress(id: string): void {
    (document.getElementById(id) as HTMLDivElement).style.visibility = 'hidden';
  }

  switchToFlow(flow: string): void {
    Array.from(document.getElementsByClassName('flow')).map(
      e => ((e as HTMLDivElement).style.display = 'none')
    );
    (document.getElementById(flow) as HTMLDivElement).style.display = 'block';
  }

  async onAudioInputsChanged(freshDevices: MediaDeviceInfo[]): Promise<void> {
    await this.populateAudioInputList();

    if (!this.currentAudioInputDevice) {
      return;
    }

    if (this.currentAudioInputDevice === 'default') {
      // The default device might actually have changed. Go ahead and trigger a
      // reselection.
      this.log('Reselecting default device.');
      await this.selectAudioInputDevice(this.currentAudioInputDevice);
      return;
    }

    const freshDeviceWithSameID = freshDevices.find(
      device => device.deviceId === this.currentAudioInputDevice
    );

    if (freshDeviceWithSameID === undefined) {
      this.log('Existing device disappeared. Selecting a new one.');

      // Select a new device.
      await this.openAudioInputFromSelectionAndPreview();
    }
  }

  audioInputMuteStateChanged(device: string | MediaStream, muted: boolean): void {
    this.log('Mute state: device', device, muted ? 'is muted' : 'is not muted');
  }

  audioInputsChanged(freshAudioInputDeviceList: MediaDeviceInfo[]): void {
    this.onAudioInputsChanged(freshAudioInputDeviceList);
  }

  videoInputsChanged(_freshVideoInputDeviceList: MediaDeviceInfo[]): void {
    this.populateVideoInputList();
  }

  audioOutputsChanged(_freshAudioOutputDeviceList: MediaDeviceInfo[]): void {
    this.populateAudioOutputList();
  }

  audioInputStreamEnded(deviceId: string): void {
    this.log(`Current audio input stream from device id ${deviceId} ended.`);
  }

  videoInputStreamEnded(deviceId: string): void {
    this.log(`Current video input stream from device id ${deviceId} ended.`);
    if (this.buttonStates['button-camera'] === 'on') {
      // Video input is ended, update button state
      this.buttonStates['button-camera'] = 'off';
      this.displayButtonStates();
    }
  }

  metricsDidReceive(clientMetricReport: ClientMetricReport): void {
    this.logAudioStreamPPS(clientMetricReport);
    this.logRedRecoveryPercent(clientMetricReport);
    const metricReport = clientMetricReport.getObservableMetrics();
    this.videoMetricReport = clientMetricReport.getObservableVideoMetrics();
    this.displayEstimatedUplinkBandwidth(metricReport.availableOutgoingBitrate);
    this.displayEstimatedDownlinkBandwidth(metricReport.availableIncomingBitrate);

    this.isButtonOn('button-video-stats') &&
      this.videoTileCollection.showVideoWebRTCStats(this.videoMetricReport);
  }

  displayEstimatedUplinkBandwidth(bitrate: number) {
    const value = `Available Uplink Bandwidth: ${bitrate ? bitrate / 1000 : 'Unknown'} Kbps`;
    (document.getElementById('video-uplink-bandwidth') as HTMLSpanElement).innerText = value;
    (document.getElementById('mobile-video-uplink-bandwidth') as HTMLSpanElement).innerText = value;
  }

  displayEstimatedDownlinkBandwidth(bitrate: number) {
    const value = `Available Downlink Bandwidth: ${bitrate ? bitrate / 1000 : 'Unknown'} Kbps`;
    (document.getElementById('video-downlink-bandwidth') as HTMLSpanElement).innerText = value;
    (document.getElementById(
      'mobile-video-downlink-bandwidth'
    ) as HTMLSpanElement).innerText = value;
  }

  resetStats = (): void => {
    this.videoMetricReport = {};
  };

  async getRelayProtocol(): Promise<void> {
    const rawStats = await this.audioVideo.getRTCPeerConnectionStats();
    if (rawStats) {
      rawStats.forEach(report => {
        if (report.type === 'local-candidate') {
          this.log(`Local WebRTC Ice Candidate stats: ${JSON.stringify(report)}`);
          const relayProtocol = report.relayProtocol;
          if (typeof relayProtocol === 'string') {
            if (relayProtocol === 'udp') {
              this.log(`Connection using ${relayProtocol.toUpperCase()} protocol`);
            } else {
              this.log(`Connection fell back to ${relayProtocol.toUpperCase()} protocol`);
            }
          }
        }
      });
    }
  }

  async createLogStream(
    configuration: MeetingSessionConfiguration,
    pathname: string
  ): Promise<void> {
    const body = JSON.stringify({
      meetingId: configuration.meetingId,
      attendeeId: configuration.credentials.attendeeId,
    });
    try {
      const response = await fetch(`${DemoMeetingApp.BASE_URL}${pathname}`, {
        method: 'POST',
        body,
      });
      if (response.status === 200) {
        console.log('[DEMO] log stream created');
      }
    } catch (error) {
      fatal(error);
      this.log(error.message);
    }
  }

  eventDidReceive(name: EventName, attributes: EventAttributes): void {
    this.log(`Received an event: ${JSON.stringify({ name, attributes })}`);
    const { meetingHistory, ...otherAttributes } = attributes;
    switch (name) {
      case 'meetingStartRequested':
      case 'meetingStartSucceeded':
      case 'meetingEnded':
      case 'audioInputSelected':
      case 'videoInputSelected':
      case 'audioInputUnselected':
      case 'videoInputUnselected':
      case 'meetingReconnected':
      case 'receivingAudioDropped':
      case 'signalingDropped':
      case 'sendingAudioFailed':
      case 'sendingAudioRecovered':
      case 'attendeePresenceReceived': {
        // Exclude the "meetingHistory" attribute for successful -> published events.
        this.meetingEventPOSTLogger?.info(
          JSON.stringify({
            name,
            attributes: otherAttributes,
          })
        );
        break;
      }
      case 'audioInputFailed':
      case 'videoInputFailed':
      case 'deviceLabelTriggerFailed':
      case 'meetingStartFailed':
      case 'meetingFailed': {
        // Send the last 5 minutes of events.
        this.meetingEventPOSTLogger?.info(
          JSON.stringify({
            name,
            attributes: {
              ...otherAttributes,
              meetingHistory: meetingHistory.filter(({ timestampMs }) => {
                return Date.now() - timestampMs < DemoMeetingApp.MAX_MEETING_HISTORY_MS;
              }),
            },
          })
        );
        break;
      }
    }
  }

  async initializeMeetingSession(configuration: MeetingSessionConfiguration): Promise<void> {
    const consoleLogger = (this.meetingLogger = new ConsoleLogger('SDK', this.logLevel));
    if (this.isLocalHost()) {
      this.meetingLogger = consoleLogger;
    } else {
      await Promise.all([
        this.createLogStream(configuration, 'create_log_stream'),
        this.createLogStream(configuration, 'create_browser_event_log_stream'),
      ]);

      this.meetingSessionPOSTLogger = getPOSTLogger(
        configuration,
        'SDK',
        `${DemoMeetingApp.BASE_URL}logs`,
        this.logLevel
      );
      this.meetingLogger = new MultiLogger(consoleLogger, this.meetingSessionPOSTLogger);
      this.meetingEventPOSTLogger = getPOSTLogger(
        configuration,
        'SDKEvent',
        `${DemoMeetingApp.BASE_URL}log_meeting_event`,
        this.logLevel
      );
    }
    this.eventReporter = await this.setupEventReporter(configuration);
    this.deviceController = new DefaultDeviceController(this.meetingLogger, {
      enableWebAudio: this.enableWebAudio,
    });
    const urlParameters = new URL(window.location.href).searchParams;
    const timeoutMs = Number(urlParameters.get('attendee-presence-timeout-ms'));
    if (!isNaN(timeoutMs)) {
      configuration.attendeePresenceTimeoutMs = Number(timeoutMs);
    }
    configuration.enableSimulcastForUnifiedPlanChromiumBasedBrowsers = this.enableSimulcast;
    if (this.usePriorityBasedDownlinkPolicy) {
      const serverSideNetworkAdaptionDropDown = document.getElementById(
        'server-side-network-adaption'
      ) as HTMLSelectElement;
      switch (serverSideNetworkAdaptionDropDown.value) {
        case 'default':
          this.videoPriorityBasedPolicyConfig.serverSideNetworkAdaption =
            ServerSideNetworkAdaption.Default;
          break;
        case 'none':
          this.videoPriorityBasedPolicyConfig.serverSideNetworkAdaption =
            ServerSideNetworkAdaption.None;
          break;
        case 'enable-bandwidth-probing':
          this.videoPriorityBasedPolicyConfig.serverSideNetworkAdaption =
            ServerSideNetworkAdaption.BandwidthProbing;
          break;
        case 'enable-bandwidth-probing-and-video-adaption':
          this.videoPriorityBasedPolicyConfig.serverSideNetworkAdaption =
            ServerSideNetworkAdaption.BandwidthProbingAndRemoteVideoQualityAdaption;
          break;
      }
      this.priorityBasedDownlinkPolicy = new VideoPriorityBasedPolicy(
        this.meetingLogger,
        this.videoPriorityBasedPolicyConfig
      );
      configuration.videoDownlinkBandwidthPolicy = this.priorityBasedDownlinkPolicy;
      this.priorityBasedDownlinkPolicy.addObserver(this);
    }
    configuration.disablePeriodicKeyframeRequestOnContentSender = this.disablePeriodicKeyframeRequestOnContentSender;

    configuration.applicationMetadata = ApplicationMetadata.create(
      'amazon-chime-sdk-js-demo',
      '2.0.0'
    );

    if ((document.getElementById('pause-last-frame') as HTMLInputElement).checked) {
      configuration.keepLastFrameWhenPaused = true;
    }

    this.meetingSession = new DefaultMeetingSession(
      configuration,
      this.meetingLogger,
      this.deviceController,
      new DefaultEventController(configuration, this.meetingLogger, this.eventReporter)
    );

    const enableAudioRedundancy = !((document.getElementById('disable-audio-redundancy') as HTMLInputElement).checked);
    let audioProfile: AudioProfile = new AudioProfile(null, enableAudioRedundancy);
    if ((document.getElementById('fullband-speech-mono-quality') as HTMLInputElement).checked) {
      audioProfile = AudioProfile.fullbandSpeechMono(enableAudioRedundancy);
      this.log('Using audio profile fullband-speech-mono-quality');
    } else if (
        (document.getElementById('fullband-music-mono-quality') as HTMLInputElement).checked
    ) {
      audioProfile = AudioProfile.fullbandMusicMono(enableAudioRedundancy);
      this.log('Using audio profile fullband-music-mono-quality');
    } else if (
        (document.getElementById('fullband-music-stereo-quality') as HTMLInputElement).checked
    ) {
      audioProfile = AudioProfile.fullbandMusicStereo(enableAudioRedundancy);
      this.log('Using audio profile fullband-music-stereo-quality');
    }
    this.log(`Audio Redundancy Enabled = ${audioProfile.hasRedundancyEnabled()}`);
    this.meetingSession.audioVideo.setAudioProfile(audioProfile);
    this.meetingSession.audioVideo.setContentAudioProfile(audioProfile);
    this.audioVideo = this.meetingSession.audioVideo;
    this.audioVideo.addDeviceChangeObserver(this);
    this.setupDeviceLabelTrigger();
    this.setupMuteHandler();
    this.setupCanUnmuteHandler();
    this.setupSubscribeToAttendeeIdPresenceHandler();
    this.setupDataMessage();
    this.setupDataFormMessage();
    this.setupDataQuestionForumMessage();
    this.setupLiveTranscription();
    this.audioVideo.addObserver(this);
    this.meetingSession.eventController.addObserver(this);
    this.audioVideo.addContentShareObserver(this);
    if (this.videoCodecPreferences !== undefined && this.videoCodecPreferences.length > 0) {
      this.audioVideo.setVideoCodecSendPreferences(this.videoCodecPreferences);
      this.audioVideo.setContentShareVideoCodecPreferences(this.videoCodecPreferences);
    }

    // The default pagination size is 25.
    let paginationPageSize = parseInt(
      (document.getElementById('pagination-page-size') as HTMLSelectElement).value
    );
    this.videoTileCollection = new VideoTileCollection(
      this.audioVideo,
      this.meetingLogger,
      this.usePriorityBasedDownlinkPolicy
        ? new VideoPreferenceManager(this.meetingLogger, this.priorityBasedDownlinkPolicy)
        : undefined,
      paginationPageSize
    );
    this.audioVideo.addObserver(this.videoTileCollection);

    this.contentShare = new ContentShareManager(
      this.meetingLogger,
      this.audioVideo,
      this.usingStereoMusicAudioProfile
    );
  }

  async setupEventReporter(configuration: MeetingSessionConfiguration): Promise<EventReporter> {
    let eventReporter: EventReporter;
    const ingestionURL = configuration.urls.eventIngestionURL;
    if (!ingestionURL) {
      return eventReporter;
    }
    if (!this.enableEventReporting) {
      return new NoOpEventReporter();
    }
    const eventReportingLogger = new ConsoleLogger('SDKEventIngestion', LogLevel.INFO);
    const meetingEventClientConfig = new MeetingEventsClientConfiguration(
      configuration.meetingId,
      configuration.credentials.attendeeId,
      configuration.credentials.joinToken
    );
    const eventIngestionConfiguration = new EventIngestionConfiguration(
      meetingEventClientConfig,
      ingestionURL
    );
    if (this.isLocalHost()) {
      eventReporter = new DefaultMeetingEventReporter(
        eventIngestionConfiguration,
        eventReportingLogger
      );
    } else {
      await this.createLogStream(configuration, 'create_browser_event_ingestion_log_stream');
      const eventReportingPOSTLogger = getPOSTLogger(
        configuration,
        'SDKEventIngestion',
        `${DemoMeetingApp.BASE_URL}log_event_ingestion`,
        LogLevel.DEBUG
      );
      const multiEventReportingLogger = new MultiLogger(
        eventReportingLogger,
        eventReportingPOSTLogger
      );
      eventReporter = new DefaultMeetingEventReporter(
        eventIngestionConfiguration,
        multiEventReportingLogger
      );
    }
    return eventReporter;
  }

  private isLocalHost(): boolean {
    return (
      document.location.host === '127.0.0.1:8080' || document.location.host === 'localhost:8080'
    );
  }

  async join(): Promise<void> {
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      this.log(event.reason);
    });
    if (this.joinMuted) {
      this.audioVideo.realtimeMuteLocalAudio();
    }
    this.audioVideo.start();
  }

  async leave(): Promise<void> {
    if (this.deleteOwnAttendeeToLeave) {
      await this.deleteAttendee(
        this.meeting,
        this.meetingSession.configuration.credentials.attendeeId
      );
      return;
    }
    this.resetStats();
    this.audioVideo.stop();
    await this.voiceFocusDevice?.stop();
    this.voiceFocusDevice = undefined;

    await this.chosenVideoTransformDevice?.stop();
    this.chosenVideoTransformDevice = undefined;
    this.roster.clear();
  }

  setupMuteHandler(): void {
    this.muteAndUnmuteLocalAudioHandler = (isMuted: boolean): void => {
      this.log(`muted = ${isMuted}`);
    };
    this.audioVideo.realtimeSubscribeToMuteAndUnmuteLocalAudio(this.muteAndUnmuteLocalAudioHandler);
    const isMuted = this.audioVideo.realtimeIsLocalAudioMuted();
    this.muteAndUnmuteLocalAudioHandler(isMuted);
  }

  setupCanUnmuteHandler(): void {
    this.canUnmuteLocalAudioHandler = (canUnmute: boolean): void => {
      this.log(`canUnmute = ${canUnmute}`);
    };
    this.audioVideo.realtimeSubscribeToSetCanUnmuteLocalAudio(this.canUnmuteLocalAudioHandler);
    this.canUnmuteLocalAudioHandler(this.audioVideo.realtimeCanUnmuteLocalAudio());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateProperty(obj: any, key: string, value: string): void {
    if (value !== undefined && obj[key] !== value) {
      obj[key] = value;
    }
  }

  setupSubscribeToAttendeeIdPresenceHandler(): void {
    this.attendeeIdPresenceHandler = (
      attendeeId: string,
      present: boolean,
      externalUserId: string,
      dropped: boolean
    ): void => {
      this.log(`${attendeeId} present = ${present} (${externalUserId})`);
      const isContentAttendee = new DefaultModality(attendeeId).hasModality(
        DefaultModality.MODALITY_CONTENT
      );
      const isSelfAttendee =
        new DefaultModality(attendeeId).base() ===
          this.meetingSession.configuration.credentials.attendeeId ||
        new DefaultModality(attendeeId).base() ===
          this.primaryMeetingSessionCredentials?.attendeeId;
      if (!present) {
        this.roster.removeAttendee(attendeeId);
        this.audioVideo.realtimeUnsubscribeFromVolumeIndicator(
          attendeeId,
          this.volumeIndicatorHandler
        );
        this.log(`${attendeeId} dropped = ${dropped} (${externalUserId})`);
        return;
      }
      //If someone else share content, stop the current content share
      if (
        !this.allowMaxContentShare() &&
        !isSelfAttendee &&
        isContentAttendee &&
        this.isButtonOn('button-content-share')
      ) {
        this.contentShare.stop();
      }
      const attendeeName =
        externalUserId.split('#').slice(-1)[0] + (isContentAttendee ? ' «Content»' : '');
      this.roster.addAttendee(attendeeId, attendeeName, this.allowAttendeeCapabilities);

      this.volumeIndicatorHandler = async (
        attendeeId: string,
        volume: number | null,
        muted: boolean | null,
        signalStrength: number | null
      ) => {
        if (muted !== null) {
          this.roster.setMuteStatus(attendeeId, muted);
        }
        if (signalStrength !== null) {
          this.roster.setSignalStrength(attendeeId, Math.round(signalStrength * 100));
        }
      };

      this.audioVideo.realtimeSubscribeToVolumeIndicator(attendeeId, this.volumeIndicatorHandler);
    };

    this.audioVideo.realtimeSubscribeToAttendeeIdPresence(this.attendeeIdPresenceHandler);

    // Hang on to this so we can unsubscribe later.
    this.activeSpeakerHandler = (attendeeIds: string[]): void => {
      // First reset all roster active speaker information
      for (const id of this.roster.getAllAttendeeIds()) {
        this.roster.setAttendeeSpeakingStatus(id, false);
      }

      // Then re-update roster and tile collection with latest information
      //
      // This will leave featured tiles up since this detector doesn't seem to clear
      // the list.
      for (const attendeeId of attendeeIds) {
        if (this.roster.hasAttendee(attendeeId)) {
          this.roster.setAttendeeSpeakingStatus(attendeeId, true);
          this.videoTileCollection.activeSpeakerAttendeeId = attendeeId;
          break; // Only show the most active speaker
        }
      }
    };

    const scoreHandler = (scores: { [attendeeId: string]: number }) => {};

    this.audioVideo.subscribeToActiveSpeakerDetector(
      new DefaultActiveSpeakerPolicy(),
      this.activeSpeakerHandler,
      scoreHandler,
      this.showActiveSpeakerScores ? 100 : 0
    );
  }

  dataMessageHandler(dataMessage: DataMessage): void {
    console.log('*************************messager:', dataMessage);
    console.log('*************************message.TYPE:', dataMessage.topic);

    if (!dataMessage.throttled) {
      const isSelf =
        dataMessage.senderAttendeeId === this.meetingSession.configuration.credentials.attendeeId;
      if (dataMessage.timestampMs <= this.lastReceivedMessageTimestamp) {
        return;
      }
      this.lastReceivedMessageTimestamp = dataMessage.timestampMs;
     
      // DREW ADD
      // console.log("*************************message:", dataMessage);
      // console.log("*************************message.TYPE:", dataMessage.topic);

      if (dataMessage.topic === 'quizForumQuestion') {
        const senderName = dataMessage.senderExternalUserId.split('#').slice(-1)[0];

        if (JSON.parse(dataMessage.text()).userId === this.meetingSession.configuration.credentials.attendeeId) {
          // update queries-block2 with the question
          const question = JSON.parse(dataMessage.text()).message;
          const queriesBlock2 = document.getElementById('queries-block2');
          queriesBlock2.innerHTML += `<div class="message-bubble-sender">${senderName}</div><div class="message-bubble-self"><p class="markdown">${question}</p></div>`;
          return;

        } else {
 
      // alert("Received "+dataMessage.text() + "added senderName to "+ senderName);
      // get userid
      const senderAttendeeId = this.meetingSession.configuration.credentials.attendeeId;
      showForumQuestion(dataMessage.text(),senderAttendeeId, senderName);
      return;}
 
      } else if (dataMessage.topic === 'displayForm' && !isSelf) {
      console.log('*************************RUNNNING DISPLAYFORM:');
      console.log('Received message:', dataMessage.text());        
      populateQuiz(dataMessage.text());
      // QUIZ RECEIVED HANDLER END

      let myModalEl = document.getElementById('challenge-modal');
      if (myModalEl) {
          let myModal = new Modal(myModalEl);
          myModal.show();
      }
        return;
      } else if (dataMessage.topic === 'displayForm' && isSelf) {
        // display the "Quiz started at ___ " timestamp on #quiz-timestamp element:
        const quizTimestamp = document.getElementById('quiz-timestamp');
        const date = new Date(dataMessage.timestampMs);
        // display the date object in the #quiz-timestamp element:
        quizTimestamp.innerText = `Quiz started at: ${date}`;

        return;        
      } else {


      // DREW ADD END

      const messageDiv = document.getElementById('receive-message') as HTMLDivElement;
      const messageNameSpan = document.createElement('div') as HTMLDivElement;
      messageNameSpan.classList.add('message-bubble-sender');
      messageNameSpan.innerText = dataMessage.senderExternalUserId.split('#').slice(-1)[0];

      const messageTextSpan = document.createElement('div') as HTMLDivElement;
      messageTextSpan.classList.add(isSelf ? 'message-bubble-self' : 'message-bubble-other');
      messageTextSpan.innerHTML = this.markdown
        .render(dataMessage.text())
        .replace(/[<]a /g, '<a target="_blank" ');

      const appendClass = (element: HTMLElement, className: string): void => {
        for (let i = 0; i < element.children.length; i++) {
          const child = element.children[i] as HTMLElement;
          child.classList.add(className);
          appendClass(child, className);
        }
      };
      appendClass(messageTextSpan, 'markdown');
      if (this.lastMessageSender !== dataMessage.senderAttendeeId) {
        messageDiv.appendChild(messageNameSpan);
      }
      this.lastMessageSender = dataMessage.senderAttendeeId;
      messageDiv.appendChild(messageTextSpan);
      messageDiv.scrollTop = messageDiv.scrollHeight; }
    } else {
      this.log('Message is throttled. Please resend');
    }
  }

  setupDataMessage(): void {
    this.audioVideo.realtimeSubscribeToReceiveDataMessage(
      DemoMeetingApp.DATA_MESSAGE_TOPIC,
      (dataMessage: DataMessage) => {
        this.dataMessageHandler(dataMessage);
      }
    );
  }

  setupDataFormMessage(): void {
    this.audioVideo.realtimeSubscribeToReceiveDataMessage(
      'displayForm',
      // last argument : no callback function:
      (dataMessage: DataMessage) => {
        this.dataMessageHandler(dataMessage);
      }
    );
  }

  setupDataQuestionForumMessage(): void {
    this.audioVideo.realtimeSubscribeToReceiveDataMessage(
      'quizForumQuestion',
      (dataMessage: DataMessage) => {
        this.dataMessageHandler(dataMessage);
      }
    );
  }


  transcriptEventHandler = (transcriptEvent: TranscriptEvent): void => {
    if (!this.enableLiveTranscription) {
      // Toggle disabled 'Live Transcription' button to enabled when we receive any transcript event
      this.enableLiveTranscription = true;
      this.updateLiveTranscriptionDisplayState();

      // Transcripts view and the button to show and hide it are initially hidden
      // Show them when when live transcription gets enabled, and do not hide afterwards
      this.setButtonVisibility('button-live-transcription', true, 'off');
      this.transcriptContainerDiv.style.display = 'block';
    }

    if (transcriptEvent instanceof TranscriptionStatus) {
      this.appendStatusDiv(transcriptEvent);
      if (transcriptEvent.type === TranscriptionStatusType.STARTED) {
        // Determine word separator based on language code
        let languageCode = null;
        const transcriptionConfiguration = JSON.parse(transcriptEvent.transcriptionConfiguration);
        if (transcriptionConfiguration) {
          if (transcriptionConfiguration.EngineTranscribeSettings) {
            languageCode = transcriptionConfiguration.EngineTranscribeSettings.LanguageCode;
          } else if (transcriptionConfiguration.EngineTranscribeMedicalSettings) {
            languageCode = transcriptionConfiguration.EngineTranscribeMedicalSettings.languageCode;
          }
        }

        if (languageCode && LANGUAGES_NO_WORD_SEPARATOR.has(languageCode)) {
          this.noWordSeparatorForTranscription = true;
        }
      } else if (
        (transcriptEvent.type === TranscriptionStatusType.STOPPED ||
          transcriptEvent.type === TranscriptionStatusType.FAILED) &&
        this.enableLiveTranscription
      ) {
        // When we receive a STOPPED status event:
        // 1. toggle enabled 'Live Transcription' button to disabled
        this.enableLiveTranscription = false;
        this.noWordSeparatorForTranscription = false;
        this.updateLiveTranscriptionDisplayState();

        // 2. force finalize all partial results
        this.partialTranscriptResultTimeMap.clear();
        this.partialTranscriptDiv = null;
        this.partialTranscriptResultMap.clear();
      }
    } else if (transcriptEvent instanceof Transcript) {
      for (const result of transcriptEvent.results) {
        const resultId = result.resultId;
        const isPartial = result.isPartial;
        const languageCode = result.languageCode;
        if (languageCode && LANGUAGES_NO_WORD_SEPARATOR.has(languageCode)) {
          this.noWordSeparatorForTranscription = true;
        }
        if (!isPartial) {
          if (result.alternatives[0].entities?.length > 0) {
            for (const entity of result.alternatives[0].entities) {
              //split the entity based on space
              let contentArray = entity.content.split(' ');
              for (const content of contentArray) {
                this.transcriptEntitySet.add(content);
              }
            }
          }
        }
        this.partialTranscriptResultMap.set(resultId, result);
        this.partialTranscriptResultTimeMap.set(resultId, result.endTimeMs);
        this.renderPartialTranscriptResults();
        if (isPartial) {
          continue;
        }

        // Force finalizing partial results that's 5 seconds older than the latest one,
        // to prevent local partial results from indefinitely growing
        for (const [olderResultId, endTimeMs] of this.partialTranscriptResultTimeMap) {
          if (olderResultId === resultId) {
            break;
          } else if (endTimeMs < result.endTimeMs - 5000) {
            this.partialTranscriptResultTimeMap.delete(olderResultId);
          }
        }

        this.partialTranscriptResultTimeMap.delete(resultId);
        this.transcriptEntitySet.clear();

        if (this.partialTranscriptResultTimeMap.size === 0) {
          // No more partial results in current batch, reset current batch
          this.partialTranscriptDiv = null;
          this.partialTranscriptResultMap.clear();
        }
      }
    }

    this.transcriptContainerDiv.scrollTop = this.transcriptContainerDiv.scrollHeight;
  };

  renderPartialTranscriptResults = () => {
    if (this.partialTranscriptDiv) {
      // Keep updating existing partial result div
      this.updatePartialTranscriptDiv();
    } else {
      // All previous results were finalized. Create a new div for new results, update, then add it to DOM
      this.partialTranscriptDiv = document.createElement('div') as HTMLDivElement;
      this.updatePartialTranscriptDiv();
      this.transcriptContainerDiv.appendChild(this.partialTranscriptDiv);
    }
  };

  updatePartialTranscriptDiv = () => {
    this.partialTranscriptDiv.innerHTML = '';

    const partialTranscriptSegments: TranscriptSegment[] = [];
    for (const result of this.partialTranscriptResultMap.values()) {
      this.populatePartialTranscriptSegmentsFromResult(partialTranscriptSegments, result);
    }
    partialTranscriptSegments.sort((a, b) => a.startTimeMs - b.startTimeMs);

    const speakerToTranscriptSpanMap = new Map<string, HTMLSpanElement>();
    for (const segment of partialTranscriptSegments) {
      const newSpeakerId = segment.attendee.attendeeId;
      if (!speakerToTranscriptSpanMap.has(newSpeakerId)) {
        this.appendNewSpeakerTranscriptDiv(segment, speakerToTranscriptSpanMap);
      } else {
        const partialResultSpeakers: string[] = Array.from(speakerToTranscriptSpanMap.keys());
        if (partialResultSpeakers.indexOf(newSpeakerId) < partialResultSpeakers.length - 1) {
          // Not the latest speaker and we reach the end of a sentence, clear the speaker to Span mapping to break line
          speakerToTranscriptSpanMap.delete(newSpeakerId);
          this.appendNewSpeakerTranscriptDiv(segment, speakerToTranscriptSpanMap);
        } else {
          const transcriptSpan = speakerToTranscriptSpanMap.get(newSpeakerId);
          transcriptSpan.appendChild(this.createSpaceSpan());
          transcriptSpan.appendChild(segment.contentSpan);
        }
      }
    }
  };

  populatePartialTranscriptSegmentsFromResult = (
    segments: TranscriptSegment[],
    result: TranscriptResult
  ) => {
    let startTimeMs: number = null;
    let attendee: Attendee = null;
    let contentSpan;
    for (const item of result.alternatives[0].items) {
      const itemContentSpan = document.createElement('span') as HTMLSpanElement;
      itemContentSpan.innerText = item.content;
      itemContentSpan.classList.add('transcript-content');
      // underline the word with red to show confidence level of predicted word being less than 0.3
      // for redaction, words are represented as '[Name]' and has a confidence of 0. Redacted words are only shown with highlighting.
      if (
        item.hasOwnProperty('confidence') &&
        !item.content.startsWith('[') &&
        item.confidence < 0.3
      ) {
        itemContentSpan.classList.add('confidence-style');
      }

      // highlight the word in green to show the predicted word is a PII/PHI entity
      if (this.transcriptEntitySet.size > 0 && this.transcriptEntitySet.has(item.content)) {
        itemContentSpan.classList.add('entity-color');
      }

      if (!startTimeMs) {
        contentSpan = document.createElement('span') as HTMLSpanElement;
        contentSpan.appendChild(itemContentSpan);
        attendee = item.attendee;
        startTimeMs = item.startTimeMs;
      } else if (item.type === TranscriptItemType.PUNCTUATION) {
        contentSpan.appendChild(itemContentSpan);
        segments.push({
          contentSpan,
          attendee: attendee,
          startTimeMs: startTimeMs,
          endTimeMs: item.endTimeMs,
        });
        startTimeMs = null;
        attendee = null;
      } else {
        if (this.noWordSeparatorForTranscription) {
          contentSpan.appendChild(itemContentSpan);
        } else {
          contentSpan.appendChild(this.createSpaceSpan());
          contentSpan.appendChild(itemContentSpan);
        }
      }
    }

    // Reached end of the result but there is no closing punctuation
    if (startTimeMs) {
      segments.push({
        contentSpan: contentSpan,
        attendee: attendee,
        startTimeMs: startTimeMs,
        endTimeMs: result.endTimeMs,
      });
    }
  };

  createSpaceSpan(): HTMLSpanElement {
    const spaceSpan = document.createElement('span') as HTMLSpanElement;
    spaceSpan.classList.add('transcript-content');
    spaceSpan.innerText = '\u00a0';
    return spaceSpan;
  };

  appendNewSpeakerTranscriptDiv = (
    segment: TranscriptSegment,
    speakerToTranscriptSpanMap: Map<string, HTMLSpanElement>
  ) => {
    const speakerTranscriptDiv = document.createElement('div') as HTMLDivElement;
    speakerTranscriptDiv.classList.add('transcript');

    const speakerSpan = document.createElement('span') as HTMLSpanElement;
    speakerSpan.classList.add('transcript-speaker');
    speakerSpan.innerText = segment.attendee.externalUserId.split('#').slice(-1)[0] + ': ';
    speakerTranscriptDiv.appendChild(speakerSpan);

    speakerTranscriptDiv.appendChild(segment.contentSpan);

    this.partialTranscriptDiv.appendChild(speakerTranscriptDiv);

    speakerToTranscriptSpanMap.set(segment.attendee.attendeeId, segment.contentSpan);
  };

  appendStatusDiv = (status: TranscriptionStatus) => {
    const statusDiv = document.createElement('div') as HTMLDivElement;
    statusDiv.innerText =
      '(Live Transcription ' +
      status.type +
      ' at ' +
      new Date(status.eventTimeMs).toLocaleTimeString() +
      ' in ' +
      status.transcriptionRegion +
      ' with configuration: ' +
      status.transcriptionConfiguration +
      (status.message ? ' due to "' + status.message + '".' : '') +
      ')';
    this.transcriptContainerDiv.appendChild(statusDiv);
  };

  setupLiveTranscription = () => {
    this.audioVideo.transcriptionController?.subscribeToTranscriptEvent(
      this.transcriptEventHandler
    );
  };

  // eslint-disable-next-line
  async sendJoinRequest(
    meeting: string,
    name: string,
    region: string,
    primaryExternalMeetingId?: string,
    audioCapability?: string,
    videoCapability?: string,
    contentCapability?: string
  ): Promise<any> {
    let uri = `${DemoMeetingApp.BASE_URL}join?title=${encodeURIComponent(
      meeting
    )}&name=${encodeURIComponent(name)}&region=${encodeURIComponent(region)}`;
    if (primaryExternalMeetingId) {
      uri += `&primaryExternalMeetingId=${primaryExternalMeetingId}`;
    }
    if (audioCapability) {
      uri += `&attendeeAudioCapability=${audioCapability}`;
    }
    if (videoCapability) {
      uri += `&attendeeVideoCapability=${videoCapability}`;
    }
    if (contentCapability) {
      uri += `&attendeeContentCapability=${contentCapability}`;
    }
    uri += `&ns_es=${this.echoReductionCapability}`;
    const response = await fetch(uri, {
      method: 'POST',
    });
    const json = await response.json();
    if (json.error) {
      throw new Error(`Server error: ${json.error}`);
    }
    return json;
  }

  async deleteAttendee(meeting: string, attendeeId: string): Promise<void> {
    let uri = `${DemoMeetingApp.BASE_URL}deleteAttendee?title=${encodeURIComponent(
      meeting
    )}&attendeeId=${encodeURIComponent(attendeeId)}`;
    const response = await fetch(uri, {
      method: 'POST',
    });
    const json = await response.json();
    this.meetingLogger.info(`Delete attendee response: ${JSON.stringify(json)}`);
  }

  async startMediaCapture(): Promise<any> {
    await fetch(
      `${DemoMeetingApp.BASE_URL}startCapture?title=${encodeURIComponent(this.meeting)}`,
      {
        method: 'POST',
      }
    );
  }

  async stopMediaCapture(): Promise<any> {
    await fetch(`${DemoMeetingApp.BASE_URL}endCapture?title=${encodeURIComponent(this.meeting)}`, {
      method: 'POST',
    });
  }

  async startLiveConnector(): Promise<any> {
    const liveConnectorresponse = await fetch(
      `${DemoMeetingApp.BASE_URL}startLiveConnector?title=${encodeURIComponent(this.meeting)}`,
      {
        method: 'POST',
      }
    );
    const json = await liveConnectorresponse.json();
    if (json.error) {
      throw new Error(`Server error: ${json.error}`);
    }
    return json;
  }

  async stopLiveConnector(): Promise<any> {
    await fetch(
      `${DemoMeetingApp.BASE_URL}endLiveConnector?title=${encodeURIComponent(this.meeting)}`,
      {
        method: 'POST',
      }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async endMeeting(): Promise<any> {
    await fetch(`${DemoMeetingApp.BASE_URL}end?title=${encodeURIComponent(this.meeting)}`, {
      method: 'POST',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAttendee(attendeeId: string): Promise<any> {
    const response = await fetch(
      `${DemoMeetingApp.BASE_URL}get_attendee?title=${encodeURIComponent(
        this.meeting
      )}&id=${encodeURIComponent(attendeeId)}`,
      {
        method: 'GET',
      }
    );
    const json = await response.json();
    if (json.error) {
      throw new Error(`Server error: ${json.error}`);
    }
    return json;
  }

  async updateAttendeeCapabilities(
    attendeeId: string,
    audioCapability: string,
    videoCapability: string,
    contentCapability: string
  ): Promise<void> {
    const uri = `${DemoMeetingApp.BASE_URL}update_attendee_capabilities?title=${encodeURIComponent(
      this.meeting
    )}&attendeeId=${encodeURIComponent(attendeeId)}&audioCapability=${encodeURIComponent(
      audioCapability
    )}&videoCapability=${encodeURIComponent(
      videoCapability
    )}&contentCapability=${encodeURIComponent(contentCapability)}`;
    const response = await fetch(uri, {
      method: 'POST',
    });
    const json = await response.json();
    if (json.error) {
      throw new Error(`Server error: ${json.error}`);
    }
    return json;
  }

  async updateAttendeeCapabilitiesExcept(
    attendees: string[],
    audioCapability: string,
    videoCapability: string,
    contentCapability: string
  ): Promise<void> {
    const uri = `${
      DemoMeetingApp.BASE_URL
    }batch_update_attendee_capabilities_except?title=${encodeURIComponent(
      this.meeting
    )}&attendeeIds=${encodeURIComponent(attendees.join(','))}&audioCapability=${encodeURIComponent(
      audioCapability
    )}&videoCapability=${encodeURIComponent(
      videoCapability
    )}&contentCapability=${encodeURIComponent(contentCapability)}`;
    const response = await fetch(uri, { method: 'POST' });
    const json = await response.json();
    if (json.error) {
      throw new Error(`Server error: ${json.error}`);
    }
    return json;
  }

  setupDeviceLabelTrigger(): void {
    // Note that device labels are privileged since they add to the
    // fingerprinting surface area of the browser session. In Chrome private
    // tabs and in all Firefox tabs, the labels can only be read once a
    // MediaStream is active. How to deal with this restriction depends on the
    // desired UX. The device controller includes an injectable device label
    // trigger which allows you to perform custom behavior in case there are no
    // labels, such as creating a temporary audio/video stream to unlock the
    // device names, which is the default behavior. Here we override the
    // trigger to also show an alert to let the user know that we are asking for
    // mic/camera permission.
    //
    // Also note that Firefox has its own device picker, which may be useful
    // for the first device selection. Subsequent device selections could use
    // a custom UX with a specific device id.
    if (!this.defaultBrowserBehavior.doesNotSupportMediaDeviceLabels()) {
      this.audioVideo.setDeviceLabelTrigger(
        async (): Promise<MediaStream> => {
          if (this.isRecorder() || this.isBroadcaster() || this.isViewOnly) {
            throw new Error('Recorder or Broadcaster does not need device labels');
          }
          this.switchToFlow('flow-need-permission');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          this.switchToFlow('flow-devices');
          return stream;
        }
      );
    }
  }

  populateDeviceList(
    elementId: string,
    genericName: string,
    devices: MediaDeviceInfo[],
    additionalOptions: string[]
  ): void {
    const list = document.getElementById(elementId) as HTMLSelectElement;
    while (list.firstElementChild) {
      list.removeChild(list.firstElementChild);
    }
    for (let i = 0; i < devices.length; i++) {
      const option = document.createElement('option');
      list.appendChild(option);
      option.text = devices[i].label || `${genericName} ${i + 1}`;
      option.value = devices[i].label ? devices[i].deviceId : '';
    }
    if (additionalOptions.length > 0) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.text = '──────────';
      list.appendChild(separator);
      for (const additionalOption of additionalOptions) {
        const option = document.createElement('option');
        list.appendChild(option);
        option.text = additionalOption;
        option.value = additionalOption;
      }
    }
    if (!list.firstElementChild) {
      const option = document.createElement('option');
      option.text = 'Device selection unavailable';
      list.appendChild(option);
    }
  }

  populateVideoPreviewFilterList(
    elementId: string,
    genericName: string,
    filters: VideoFilterName[]
  ): void {
    const list = document.getElementById(elementId) as HTMLSelectElement;
    while (list.firstElementChild) {
      list.removeChild(list.firstElementChild);
    }
    for (let i = 0; i < filters.length; i++) {
      const option = document.createElement('option');
      list.appendChild(option);
      option.text = filters[i] || `${genericName} ${i + 1}`;
      option.value = filters[i];
    }

    if (!list.firstElementChild) {
      const option = document.createElement('option');
      option.text = 'Filter selection unavailable';
      list.appendChild(option);
    }
  }

  populateInMeetingDeviceList(
    elementId: string,
    genericName: string,
    devices: MediaDeviceInfo[],
    additionalOptions: string[],
    additionalToggles: Toggle[] | undefined,
    callback: (name: string) => void
  ): void {
    const menu = document.getElementById(elementId) as HTMLDivElement;
    while (menu.firstElementChild) {
      menu.removeChild(menu.firstElementChild);
    }
    for (let i = 0; i < devices.length; i++) {
      this.createDropdownMenuItem(menu, devices[i].label || `${genericName} ${i + 1}`, () => {
        callback(devices[i].deviceId);
      });
    }
    if (additionalOptions.length) {
      this.createDropdownMenuItem(menu, '──────────', () => { }).classList.add('text-center');
      for (const additionalOption of additionalOptions) {
        this.createDropdownMenuItem(
          menu,
          additionalOption,
          () => {
            callback(additionalOption);
          },
          `${elementId}-${additionalOption.replace(/\s/g, '-')}`
        );
      }
    }
    if (additionalToggles?.length) {
      this.createDropdownMenuItem(menu, '──────────', () => { }).classList.add('text-center');
      for (const { name, oncreate, action } of additionalToggles) {
        const id = `toggle-${elementId}-${name.replace(/\s/g, '-')}`;
        const elem = this.createDropdownMenuItem(menu, name, action, id);
        oncreate(elem);
      }
    }
    if (!menu.firstElementChild) {
      this.createDropdownMenuItem(menu, 'Device selection unavailable', () => { });
    }
  }

  createDropdownMenuItem(
    menu: HTMLDivElement,
    title: string,
    clickHandler: () => void,
    id?: string
  ): HTMLButtonElement {
    const button = document.createElement('button') as HTMLButtonElement;
    menu.appendChild(button);
    button.innerText = title;
    button.classList.add('dropdown-item');
    this.updateProperty(button, 'id', id);
    button.addEventListener('click', () => {
      clickHandler();
    });
    return button;
  }

  async populateAllDeviceLists(): Promise<void> {
    await this.populateAudioInputList();
    await this.populateVideoInputList();
    await this.populateAudioOutputList();
  }

  private async selectVideoFilterByName(name: VideoFilterName): Promise<void> {
    this.selectedVideoFilterItem = name;
    this.log(`clicking video filter ${this.selectedVideoFilterItem}`);
    this.toggleButton(
      'button-video-filter',
      this.selectedVideoFilterItem === 'None' ? 'off' : 'on'
    );
    if (this.isButtonOn('button-camera')) {
      try {
        await this.openVideoInputFromSelection(this.selectedVideoInput, false);
      } catch (err) {
        fatal(err);
        this.log('Failed to choose VideoTransformDevice', err);
      }
    }
  }

  private async stopVideoProcessor(): Promise<void> {
    this.log('Clearing filter variables and stopping the video transform device');
    this.chosenVideoFilter = 'None';
    this.selectedVideoFilterItem = 'None';
    this.chosenVideoTransformDevice?.stop();
  }

  private getBackgroundBlurSpec(): BackgroundFilterSpec {
    return {
      paths: BACKGROUND_BLUR_PATHS,
      model: BACKGROUND_BLUR_MODEL,
      ...BACKGROUND_BLUR_ASSET_SPEC
    };
  }

  private async populateVideoFilterInputList(isPreviewWindow: boolean): Promise<void> {
    const genericName = 'Filter';
    let filters: VideoFilterName[] = ['None'];

    if (this.areVideoFiltersSupported()) {
      filters = filters.concat(VIDEO_FILTERS);
      if (platformCanSupportBodyPixWithoutDegradation()) {
        if (!this.loadingBodyPixDependencyPromise) {
          this.loadingBodyPixDependencyPromise = loadBodyPixDependency(
            this.loadingBodyPixDependencyTimeoutMs
          );
        }
        // do not use `await` to avoid blocking page loading
        this.loadingBodyPixDependencyPromise
          .then(() => {
            filters.push('Segmentation');
            this.populateFilterList(isPreviewWindow, genericName, filters);
          })
          .catch(err => {
            this.log('Could not load BodyPix dependency', err);
          });
      }

      if (this.supportsBackgroundBlur) {
        filters.push('Background Blur 10% CPU');
        filters.push('Background Blur 20% CPU');
        filters.push('Background Blur 30% CPU');
        filters.push('Background Blur 40% CPU');
      }

      if (this.supportsBackgroundReplacement) {
        filters.push('Background Replacement');
      }

      // Add VideoFx functionality/options if the processor is supported
      if (this.supportsVideoFx) {
        BACKGROUND_FILTER_V2_LIST.map(effectName => filters.push(effectName));
      }
    }

    this.populateFilterList(isPreviewWindow, genericName, filters);
  }

  private async populateFilterList(
    isPreviewWindow: boolean,
    genericName: string,
    filters: VideoFilterName[]
  ): Promise<void> {
    if (isPreviewWindow) {
      this.populateVideoPreviewFilterList('video-input-filter', genericName, filters);
    } else {
      this.populateInMeetingDeviceList(
        'dropdown-menu-filter',
        genericName,
        [],
        filters,
        undefined,
        async (name: VideoFilterName) => {
          await this.selectVideoFilterByName(name);
        }
      );
    }
  }

  async populateAudioInputList(): Promise<void> {
    const genericName = 'Microphone';
    let additionalDevices = ['None', '440 Hz', 'Prerecorded Speech', 'Prerecorded Speech Loop (Mono)', 'Echo'];
    const additionalStereoTestDevices = ['L-500Hz R-1000Hz', 'Prerecorded Speech Loop (Stereo)'];
    const additionalToggles = [];

    if (!this.defaultBrowserBehavior.hasFirefoxWebRTC()) {
      // We don't add this in Firefox because there is no known mechanism, using MediaStream or WebAudio APIs,
      // to *not* generate audio in Firefox. By default, everything generates silent audio packets in Firefox.
      additionalDevices.push('No Audio');
    }

    // This can't work unless Web Audio is enabled.
    if (this.enableWebAudio && this.supportsVoiceFocus) {
      additionalToggles.push({
        name: 'Amazon Voice Focus',
        oncreate: (elem: HTMLElement) => {
          this.voiceFocusDisplayables.push(elem);
        },
        action: () => this.toggleVoiceFocusInMeeting(),
      });
    }

    // Don't allow replica meeting attendees to enable transcription even when promoted
    if (this.primaryExternalMeetingId === undefined || this.primaryExternalMeetingId.length === 0) {
      additionalToggles.push({
        name: 'Live Transcription',
        oncreate: (elem: HTMLElement) => {
          this.liveTranscriptionDisplayables.push(elem);
        },
        action: () => this.toggleLiveTranscription(),
      });
    }

    this.populateDeviceList(
      'audio-input',
      genericName,
      await this.audioVideo.listAudioInputDevices(),
      additionalDevices
    );

    if (this.usingStereoMusicAudioProfile) {
      additionalDevices = additionalDevices.concat(additionalStereoTestDevices);
    }

    this.populateInMeetingDeviceList(
      'dropdown-menu-microphone',
      genericName,
      await this.audioVideo.listAudioInputDevices(),
      additionalDevices,
      additionalToggles,
      async (name: string) => {
        await this.selectAudioInputDeviceByName(name);
      }
    );
  }

  private areVideoFiltersSupported(): boolean {
    return this.defaultBrowserBehavior.supportsCanvasCapturedStreamPlayback();
  }

  private isVoiceFocusActive(): boolean {
    return this.currentAudioInputDevice instanceof VoiceFocusTransformDevice;
  }

  private updateVoiceFocusDisplayState(): void {
    const active = this.isVoiceFocusActive();
    this.log('Updating Amazon Voice Focus display state:', active);
    for (const elem of this.voiceFocusDisplayables) {
      elem.classList.toggle('vf-active', active);
    }
  }
  public showQuiz(): void {
    console.log('done');
    this.switchToFlow('quiz');
  }
  private isVoiceFocusEnabled(): boolean {
    this.log('VF supported:', this.supportsVoiceFocus);
    this.log('VF enabled:', this.enableVoiceFocus);
    return this.supportsVoiceFocus && this.enableVoiceFocus;
  }

  private async reselectAudioInputDevice(): Promise<void> {
    const current = this.currentAudioInputDevice;

    if (current instanceof VoiceFocusTransformDevice) {
      // Unwrap and rewrap if Amazon Voice Focus is selected.
      const intrinsic = current.getInnerDevice();
      const device = await this.audioInputSelectionWithOptionalVoiceFocus(intrinsic);
      return this.selectAudioInputDevice(device);
    }

    // If it's another kind of transform device, just reselect it.
    if (isAudioTransformDevice(current)) {
      return this.selectAudioInputDevice(current);
    }

    // Otherwise, apply Amazon Voice Focus if needed.
    const device = await this.audioInputSelectionWithOptionalVoiceFocus(current);
    return this.selectAudioInputDevice(device);
  }

  private async toggleVoiceFocusInMeeting(): Promise<void> {
    const elem = document.getElementById('add-voice-focus') as HTMLInputElement;
    this.enableVoiceFocus = this.supportsVoiceFocus && !this.enableVoiceFocus;
    elem.checked = this.enableVoiceFocus;
    this.log('Amazon Voice Focus toggle is now', elem.checked);

    await this.reselectAudioInputDevice();
  }

  private updateLiveTranscriptionDisplayState() {
    this.log('Updating live transcription display state to:', this.enableLiveTranscription);
    for (const elem of this.liveTranscriptionDisplayables) {
      elem.classList.toggle('live-transcription-active', this.enableLiveTranscription);
    }
  }

  private async toggleLiveTranscription(): Promise<void> {
    this.log(
      'live transcription were previously set to ' +
        this.enableLiveTranscription +
        '; attempting to toggle'
    );

    if (this.enableLiveTranscription) {
      const response = await fetch(
        `${DemoMeetingApp.BASE_URL}${encodeURIComponent(
          'stop_transcription'
        )}?title=${encodeURIComponent(this.meeting)}`,
        {
          method: 'POST',
        }
      );
      const json = await response.json();
      if (json.error) {
        throw new Error(`Server error: ${json.error}`);
      }
    } else {
      const liveTranscriptionModal = document.getElementById(`live-transcription-modal`);
      liveTranscriptionModal.style.display = 'block';
    }
  }

  async populateVideoInputList(): Promise<void> {
    const genericName = 'Camera';
    const additionalDevices = ['None', 'Blue', 'SMPTE Color Bars'];
    this.populateDeviceList(
      'video-input',
      genericName,
      await this.audioVideo.listVideoInputDevices(),
      additionalDevices
    );
    this.populateInMeetingDeviceList(
      'dropdown-menu-camera',
      genericName,
      await this.audioVideo.listVideoInputDevices(),
      additionalDevices,
      undefined,
      async (name: string) => {
        try {
          // If video is already started sending or the video button is enabled, then reselect a new stream
          // Otherwise, just update the device.
          if (this.meetingSession.audioVideo.hasStartedLocalVideoTile()) {
            await this.openVideoInputFromSelection(name, false);
          } else {
            this.selectedVideoInput = name;
          }
        } catch (err) {
          fatal(err);
        }
      }
    );
    const cameras = await this.audioVideo.listVideoInputDevices();
    this.cameraDeviceIds = cameras.map(deviceInfo => {
      return deviceInfo.deviceId;
    });
  }

  async populateAudioOutputList(): Promise<void> {
    const supportsChoosing = this.defaultBrowserBehavior.supportsSetSinkId();
    const genericName = 'Speaker';
    const additionalDevices: string[] = [];
    const devices = supportsChoosing ? await this.audioVideo.listAudioOutputDevices() : [];
    this.populateDeviceList('audio-output', genericName, devices, additionalDevices);
    this.populateInMeetingDeviceList(
      'dropdown-menu-speaker',
      genericName,
      devices,
      additionalDevices,
      undefined,
      async (name: string) => {
        if (!supportsChoosing) {
          return;
        }
        try {
          await this.chooseAudioOutput(name);
        } catch (e) {
          fatal(e);
          this.log('Failed to chooseAudioOutput', e);
        }
      }
    );
  }

  private async chooseAudioOutput(device: string): Promise<void> {
    // Set it for the content share stream if we can.
    const videoElem = document.getElementById('content-share-video') as HTMLVideoElement;
    if (this.defaultBrowserBehavior.supportsSetSinkId()) {
      // @ts-ignore
      videoElem.setSinkId(device);
    }

    await this.audioVideo.chooseAudioOutput(device);
  }

  private analyserNodeCallback: undefined | (() => void);

  async selectedAudioInput(): Promise<AudioInputDevice> {
    const audioInput = document.getElementById('audio-input') as HTMLSelectElement;
    const device = await this.audioInputSelectionToDevice(audioInput.value);
    return device;
  }

  async selectAudioInputDevice(device: AudioInputDevice): Promise<void> {
    this.currentAudioInputDevice = device;
    this.log('Selecting audio input', device);
    try {
      await this.audioVideo.startAudioInput(device);
    } catch (e) {
      fatal(e);
      this.log(`failed to choose audio input device ${device}`, e);
    }
    this.updateVoiceFocusDisplayState();
  }

  async selectAudioInputDeviceByName(name: string): Promise<void> {
    this.log('Selecting audio input device by name:', name);
    const device = await this.audioInputSelectionToDevice(name);
    return this.selectAudioInputDevice(device);
  }

  async openAudioInputFromSelection(): Promise<void> {
    const device = await this.selectedAudioInput();
    await this.selectAudioInputDevice(device);
  }

  async openAudioInputFromSelectionAndPreview(): Promise<void> {
    await this.stopAudioPreview();
    await this.openAudioInputFromSelection();
    this.log('Starting audio preview.');
    await this.startAudioPreview();
  }

  setAudioPreviewPercent(percent: number): void {
    const audioPreview = document.getElementById('audio-preview');
    if (!audioPreview) {
      return;
    }
    this.updateProperty(audioPreview.style, 'transitionDuration', '33ms');
    this.updateProperty(audioPreview.style, 'width', `${percent}%`);
    if (audioPreview.getAttribute('aria-valuenow') !== `${percent}`) {
      audioPreview.setAttribute('aria-valuenow', `${percent}`);
    }
  }

  async stopAudioPreview(): Promise<void> {
    if (!this.analyserNode) {
      return;
    }

    this.analyserNodeCallback = undefined;

    // Disconnect the analyser node from its inputs and outputs.
    this.analyserNode.disconnect();
    this.analyserNode.removeOriginalInputs();

    this.analyserNode = undefined;
  }

  startAudioPreview(): void {
    this.setAudioPreviewPercent(0);

    // Recreate.
    if (this.analyserNode) {
      // Disconnect the analyser node from its inputs and outputs.
      this.analyserNode.disconnect();
      this.analyserNode.removeOriginalInputs();

      this.analyserNode = undefined;
    }

    const analyserNode = this.audioVideo.createAnalyserNodeForAudioInput();

    if (!analyserNode) {
      return;
    }

    if (!analyserNode.getByteTimeDomainData) {
      document.getElementById('audio-preview').parentElement.style.visibility = 'hidden';
      return;
    }

    this.analyserNode = analyserNode;
    const data = new Uint8Array(analyserNode.fftSize);
    let frameIndex = 0;
    this.analyserNodeCallback = () => {
      if (frameIndex === 0) {
        analyserNode.getByteTimeDomainData(data);
        const lowest = 0.01;
        let max = lowest;
        for (const f of data) {
          max = Math.max(max, (f - 128) / 128);
        }
        let normalized = (Math.log(lowest) - Math.log(max)) / Math.log(lowest);
        let percent = Math.min(Math.max(normalized * 100, 0), 100);
        this.setAudioPreviewPercent(percent);
      }
      frameIndex = (frameIndex + 1) % 2;
      if (this.analyserNodeCallback) {
        requestAnimationFrame(this.analyserNodeCallback);
      }
    };
    requestAnimationFrame(this.analyserNodeCallback);
  }

  async openAudioOutputFromSelection(): Promise<void> {
    if (this.defaultBrowserBehavior.supportsSetSinkId()) {
      try {
        const audioOutput = document.getElementById('audio-output') as HTMLSelectElement;
        await this.chooseAudioOutput(audioOutput.value);
      } catch (e) {
        fatal(e);
        this.log('failed to chooseAudioOutput', e);
      }
    }
    const audioMix = document.getElementById('meeting-audio') as HTMLAudioElement;
    try {
      await this.audioVideo.bindAudioElement(audioMix);
    } catch (e) {
      fatal(e);
      this.log('failed to bindAudioElement', e);
    }
  }

  private selectedVideoInput: string | null = null;
  async openVideoInputFromSelection(selection: string | null, showPreview: boolean): Promise<void> {
    this.selectedVideoInput = selection;
    this.log(`Switching to: ${this.selectedVideoInput}`);
    const device = await this.videoInputSelectionToDevice(this.selectedVideoInput);
    if (device === null) {
      try {
        await this.audioVideo.stopVideoInput();
      } catch (e) {
        fatal(e);
        this.log(`failed to stop video input`, e);
      }
      this.log('no video device selected');
      if (showPreview) {
        const videoPreviewEl = document.getElementById('video-preview') as HTMLVideoElement;
        await this.audioVideo.stopVideoPreviewForVideoInput(videoPreviewEl);
      }
    } else {
      try {
        await this.audioVideo.startVideoInput(device);
      } catch (e) {
        fatal(e);
        this.log(`failed to start video input ${device}`, e);
      }
      if (showPreview) {
        const videoPreviewEl = document.getElementById('video-preview') as HTMLVideoElement;
        this.audioVideo.startVideoPreviewForVideoInput(videoPreviewEl);
      }
    }
  }

  private async audioInputSelectionToIntrinsicDevice(value: string): Promise<Device> {
    if (this.isRecorder() || this.isBroadcaster()) {
      return null;
    }

    if (value === '440 Hz') {
      return DefaultDeviceController.synthesizeAudioDevice(440);
    }

    if (value === 'L-500Hz R-1000Hz') {
      return new SynthesizedStereoMediaStreamProvider(500, 1000).getMediaStream();
    }

    if (value === 'Prerecorded Speech') {
      return new AudioBufferMediaStreamProvider('audio_file').getMediaStream();
    }
    if (value === 'Prerecorded Speech Loop (Mono)') {
      return new AudioBufferMediaStreamProvider('audio_file', /*shouldLoop*/ true).getMediaStream();
    }

    if (value === 'Prerecorded Speech Loop (Stereo)') {
      return new AudioBufferMediaStreamProvider('stereo_audio_file', true).getMediaStream();
    }

    // use the speaker output MediaStream with a 50ms delay and a 20% volume reduction as audio input
    if (value === 'Echo') {
      try {
        const speakerStream = await this.audioVideo.getCurrentMeetingAudioStream();

        const audioContext = DefaultDeviceController.getAudioContext();
        const streamDestination = audioContext.createMediaStreamDestination();
        const audioSourceNode = audioContext.createMediaStreamSource(speakerStream);
        const delayNode = audioContext.createDelay(0.05);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.8;

        // connect the AudioSourceNode, DelayNode and GainNode to the same output destination
        audioSourceNode.connect(delayNode);
        delayNode.connect(gainNode);
        gainNode.connect(streamDestination);

        return streamDestination.stream;
      } catch (e) {
        this.log(`Error creating Echo`);
        return null;
      }
    }

    if (value === 'No Audio') {
      // An empty media stream destination without any source connected to it, so it doesn't generate any audio.
      // This is currently only used for integration testing of 'sendingAudioFailed' and 'sendingAudioRecovered' events.
      // Note: It's currently not possible to emulate 'No Audio' in Firefox, so we don't provide it
      // as an option in the audio inputs list.
      return DefaultDeviceController.getAudioContext().createMediaStreamDestination().stream;
    }

    if (value === 'None' || value === '') {
      // When the device is passed in as null, the SDK will synthesize an empty audio device that generates silence.
      return null;
    }

    return value;
  }

  private async getVoiceFocusDeviceTransformer(
    maxComplexity?: VoiceFocusModelComplexity
  ): Promise<VoiceFocusDeviceTransformer> {
    if (this.voiceFocusTransformer) {
      return this.voiceFocusTransformer;
    }

    function exceeds(configured: VoiceFocusModelComplexity): boolean {
      const max = Number.parseInt(maxComplexity.substring(1), 10);
      const complexity = Number.parseInt(configured.substring(1), 10);
      return complexity > max;
    }

    const logger = new ConsoleLogger('SDK', LogLevel.DEBUG);

    // Find out what it will actually execute, and cap it if needed.
    const spec: VoiceFocusSpec = getVoiceFocusSpec(this.joinInfo);
    const config = await VoiceFocusDeviceTransformer.configure(spec, { logger });

    let transformer;
    if (maxComplexity && config.supported && exceeds(config.model.variant)) {
      logger.info(`Downgrading VF to ${maxComplexity}`);
      spec.variant = maxComplexity;
      transformer = VoiceFocusDeviceTransformer.create(spec, { logger }, undefined, this.joinInfo);
    } else {
      transformer = VoiceFocusDeviceTransformer.create(spec, { logger }, config, this.joinInfo);
    }

    return this.voiceFocusTransformer = await transformer;
  }

  private async createVoiceFocusDevice(inner: Device): Promise<VoiceFocusTransformDevice | Device> {
    if (!this.supportsVoiceFocus) {
      return inner;
    }

    if (this.voiceFocusDevice) {
      // Dismantle the old one.
      return (this.voiceFocusDevice = await this.voiceFocusDevice.chooseNewInnerDevice(inner));
    }

    try {
      const transformer = await this.getVoiceFocusDeviceTransformer(MAX_VOICE_FOCUS_COMPLEXITY);
      const vf: VoiceFocusTransformDevice = await transformer.createTransformDevice(inner);
      if (vf) {
        await vf.observeMeetingAudio(this.audioVideo);
        return this.voiceFocusDevice = vf;
      }
    } catch (e) {
      // Fall through.
    }
    return inner;
  }

  private async audioInputSelectionWithOptionalVoiceFocus(
    device: Device
  ): Promise<Device | VoiceFocusTransformDevice> {
    if (this.isVoiceFocusEnabled()) {
      if (!this.voiceFocusDevice) {
        return this.createVoiceFocusDevice(device);
      }

      // Switch out the inner if needed.
      // The reuse of the Voice Focus device is more efficient, particularly if
      // reselecting the same inner -- no need to modify the Web Audio graph.
      // Allowing the Voice Focus device to manage toggling Voice Focus on and off
      // also
      return (this.voiceFocusDevice = await this.voiceFocusDevice.chooseNewInnerDevice(device));
    }

    return device;
  }

  private async audioInputSelectionToDevice(
    value: string
  ): Promise<Device | VoiceFocusTransformDevice> {
    const inner = await this.audioInputSelectionToIntrinsicDevice(value);
    return this.audioInputSelectionWithOptionalVoiceFocus(inner);
  }

  private videoInputSelectionToIntrinsicDevice(value: string): Device {
    if (value === 'Blue') {
      return SyntheticVideoDeviceFactory.create('blue');
    }

    if (value === 'SMPTE Color Bars') {
      return SyntheticVideoDeviceFactory.create('smpte');
    }

    return value;
  }

  private async videoFilterToProcessor(videoFilter: string): Promise<VideoFrameProcessor | null> {
    this.log(`Choosing video filter ${videoFilter}`);

    if (videoFilter === 'Emojify') {
      return new EmojifyVideoFrameProcessor('🚀');
    }

    if (videoFilter === 'CircularCut') {
      return new CircularCut();
    }

    if (videoFilter === 'NoOp') {
      return new NoOpVideoFrameProcessor();
    }

    if (videoFilter === 'Segmentation') {
      return new SegmentationProcessor();
    }

    if (videoFilter === 'Resize (9/16)') {
      return new ResizeProcessor(0.5625); // 16/9 Aspect Ratio
    }

    if (BACKGROUND_BLUR_V1_LIST.includes(videoFilter as VideoFilterName)) {
      // In the event that frames start being dropped we should take some action to remove the background blur.
      this.blurObserver = {
        filterFrameDurationHigh: event => {
          this.log(
            `background filter duration high: framed dropped - ${event.framesDropped}, avg - ${event.avgFilterDurationMillis} ms, frame rate - ${event.framerate}, period - ${event.periodMillis} ms`
          );
        },
        filterCPUUtilizationHigh: event => {
          this.log(`background filter CPU utilization high: ${event.cpuUtilization}%`);
        },
      };

      const cpuUtilization: number = Number(videoFilter.match(/([0-9]{2})%/)[1]);
      this.blurProcessor = await BackgroundBlurVideoFrameProcessor.create(
        this.getBackgroundBlurSpec(),
        { filterCPUUtilization: cpuUtilization }
      );
      this.blurProcessor.addObserver(this.blurObserver);
      return this.blurProcessor;
    }

    if (BACKGROUND_REPLACEMENT_V1_LIST.includes(videoFilter as VideoFilterName)) {
      // In the event that frames start being dropped we should take some action to remove the background replacement.
      this.replacementObserver = {
        filterFrameDurationHigh: event => {
          this.log(
            `background filter duration high: framed dropped - ${event.framesDropped}, avg - ${event.avgFilterDurationMillis} ms, frame rate - ${event.framerate}, period - ${event.periodMillis} ms`
          );
        },
      };

      this.replacementProcessor = await BackgroundReplacementVideoFrameProcessor.create(
        this.getBackgroundBlurSpec(),
        await this.getBackgroundReplacementOptions()
      );
      this.replacementProcessor.addObserver(this.replacementObserver);
      return this.replacementProcessor;
    }

    // Create a VideoFxProcessor
    if (BACKGROUND_FILTER_V2_LIST.includes(videoFilter as VideoFilterName)) {
      const defaultBudgetPerFrame: number = 50;
      this.updateFxConfig(videoFilter);
      try {
        this.videoFxProcessor = await VideoFxProcessor.create(
          this.meetingLogger,
          this.videoFxConfig,
          defaultBudgetPerFrame
        );
        return this.videoFxProcessor;
      } catch (error) {
        this.meetingLogger.warn(error.toString());
        return new NoOpVideoFrameProcessor();
      }
    }
    return null;
  }

  /**
   * Update this.videoFxConfig to match the corresponding configuration specified by the videoFilter.
   * @param videoFilter
   */
  private updateFxConfig(videoFilter: string): void {
    this.videoFxConfig.backgroundBlur.isEnabled = (
      videoFilter === 'Background Blur 2.0 - Low' ||
      videoFilter === 'Background Blur 2.0 - Medium' ||
      videoFilter === 'Background Blur 2.0 - High'
    )

    this.videoFxConfig.backgroundReplacement.isEnabled = (
      videoFilter === 'Background Replacement 2.0 - (Beach)' ||
      videoFilter === 'Background Replacement 2.0 - (Default)' ||
      videoFilter === 'Background Replacement 2.0 - (Blue)'
    )
    switch(videoFilter) {
      case 'Background Blur 2.0 - Low':
        this.videoFxConfig.backgroundBlur.strength = 'low';
        break;
      case 'Background Blur 2.0 - Medium':
        this.videoFxConfig.backgroundBlur.strength = 'medium';
        break;
      case 'Background Blur 2.0 - High':
        this.videoFxConfig.backgroundBlur.strength = 'high';
        break;
      case 'Background Replacement 2.0 - (Beach)':
        this.videoFxConfig.backgroundReplacement.backgroundImageURL = BackgroundImageEncoding();
        this.videoFxConfig.backgroundReplacement.defaultColor = null;
        break;
      case 'Background Replacement 2.0 - (Default)':
        this.videoFxConfig.backgroundReplacement.backgroundImageURL = null;
        this.videoFxConfig.backgroundReplacement.defaultColor = '#000000';
        break;
      case 'Background Replacement 2.0 - (Blue)':
        this.videoFxConfig.backgroundReplacement.backgroundImageURL = null;
        this.videoFxConfig.backgroundReplacement.defaultColor = '#26A4FF';
        break;
    }
  }

  private async videoInputSelectionWithOptionalFilter(
    innerDevice: Device
  ): Promise<VideoInputDevice> {
    if (this.selectedVideoFilterItem === 'None') {
      return innerDevice;
    }
    // We have reselected our filter, don't need to make a new processor
    if (
      this.chosenVideoTransformDevice &&
      this.selectedVideoFilterItem === this.chosenVideoFilter
    ) {
      // Our input device has changed, so swap it out for the new one
      if (this.chosenVideoTransformDevice.getInnerDevice() !== innerDevice) {
        this.chosenVideoTransformDevice = this.chosenVideoTransformDevice.chooseNewInnerDevice(
          innerDevice
        );
      }
      return this.chosenVideoTransformDevice;
    }

    // A different filter is selected so we must modify our processor
    if (this.chosenVideoTransformDevice) {
      await this.chosenVideoTransformDevice.stop();
    }
    const proc = await this.videoFilterToProcessor(this.selectedVideoFilterItem);
    this.chosenVideoFilter = this.selectedVideoFilterItem;
    this.chosenVideoTransformDevice = new DefaultVideoTransformDevice(
      this.meetingLogger,
      innerDevice,
      [proc]
    );
    return this.chosenVideoTransformDevice;
  }

  private async videoInputSelectionToDevice(value: string | null): Promise<VideoInputDevice> {
    if (this.isRecorder() || this.isBroadcaster() || value === 'None' || value === null) {
      return null;
    }
    const intrinsicDevice = this.videoInputSelectionToIntrinsicDevice(value);
    return await this.videoInputSelectionWithOptionalFilter(intrinsicDevice);
  }

  isRecorder(): boolean {
    return new URL(window.location.href).searchParams.get('record') === 'true';
  }

  isBroadcaster(): boolean {
    return new URL(window.location.href).searchParams.get('broadcast') === 'true';
  }

  isAbortingOnReconnect(): boolean {
    return new URL(window.location.href).searchParams.get('abort-on-reconnect') === 'true';
  }

  async authenticate(): Promise<string> {
    this.joinInfo = (
      await this.sendJoinRequest(
        this.meeting,
        this.name,
        this.region,
        this.primaryExternalMeetingId,
        this.audioCapability,
        this.videoCapability,
        this.contentCapability
      )
    ).JoinInfo;
    this.region = this.joinInfo.Meeting.Meeting.MediaRegion;
    const configuration = new MeetingSessionConfiguration(
      this.joinInfo.Meeting,
      this.joinInfo.Attendee
    );
    await this.initializeMeetingSession(configuration);
    this.primaryExternalMeetingId = this.joinInfo.PrimaryExternalMeetingId;
    const url = new URL(window.location.href);
    url.searchParams.set('m', this.meeting);
    history.replaceState({}, `${this.meeting}`, url.toString());
    return configuration.meetingId;
  }

  async initAttendeeCapabilityFeature(): Promise<void> {
    const rosterMenuContainer = document.getElementById('roster-menu-container');
    if (this.allowAttendeeCapabilities) {
      rosterMenuContainer.classList.remove('hidden');
      rosterMenuContainer.classList.add('d-flex');

      const attendeeCapabilitiesModal = document.getElementById('attendee-capabilities-modal');
      attendeeCapabilitiesModal.addEventListener('show.bs.modal', async (event: any) => {
        const button = event.relatedTarget;
        const type = button.getAttribute('data-bs-type');
        const descriptionElement = document.getElementById(
          'attendee-capabilities-modal-description'
        );

        const audioSelectElement = document.getElementById(
          'attendee-capabilities-modal-audio-select'
        ) as HTMLSelectElement;
        const videoSelectElement = document.getElementById(
          'attendee-capabilities-modal-video-select'
        ) as HTMLSelectElement;
        const contentSelectElement = document.getElementById(
          'attendee-capabilities-modal-content-select'
        ) as HTMLSelectElement;

        audioSelectElement.value = '';
        videoSelectElement.value = '';
        contentSelectElement.value = '';

        audioSelectElement.disabled = true;
        videoSelectElement.disabled = true;
        contentSelectElement.disabled = true;

        // Clone the `selectedAttendeeSet` upon selecting the menu option to open a modal.
        // Note that the `selectedAttendeeSet` may change when API calls are made.
        const selectedAttendeeSet = new Set(this.roster.selectedAttendeeSet);

        if (type === 'one-attendee') {
          const [selectedAttendee] = selectedAttendeeSet;
          descriptionElement.innerHTML = `Update <b>${selectedAttendee.name}</b>'s attendee capabilities.`;

          // Load the selected attendee's capabilities.
          const { Attendee } = await this.getAttendee(selectedAttendee.id);
          audioSelectElement.value = Attendee.Capabilities.Audio;
          videoSelectElement.value = Attendee.Capabilities.Video;
          contentSelectElement.value = Attendee.Capabilities.Content;
        } else {
          if (this.roster.selectedAttendeeSet.size === 0) {
            descriptionElement.innerHTML = `Update the capabilities of all attendees.`;
          } else {
            descriptionElement.innerHTML = `Update the capabilities of all attendees, excluding:<ul> ${[
              ...selectedAttendeeSet,
            ]
              .map(attendee => `<li><b>${attendee.name}</b></li>`)
              .join('')}</ul>`;
          }

          audioSelectElement.value = 'SendReceive';
          videoSelectElement.value = 'SendReceive';
          contentSelectElement.value = 'SendReceive';
        }

        audioSelectElement.disabled = false;
        videoSelectElement.disabled = false;
        contentSelectElement.disabled = false;

        const saveButton = document.getElementById(
          'attendee-capabilities-save-button'
        ) as HTMLButtonElement;
        const onClickSaveButton = async () => {
          saveButton.removeEventListener('click', onClickSaveButton);
          Modal.getInstance(attendeeCapabilitiesModal).hide();
          this.roster.unselectAll();

          try {
            if (type === 'one-attendee') {
              const [selectedAttendee] = selectedAttendeeSet;
              await this.updateAttendeeCapabilities(
                selectedAttendee.id,
                audioSelectElement.value,
                videoSelectElement.value,
                contentSelectElement.value
              );
            } else {
              await this.updateAttendeeCapabilitiesExcept(
                [...selectedAttendeeSet].map(attendee => attendee.id),
                audioSelectElement.value,
                videoSelectElement.value,
                contentSelectElement.value
              );
            }
          } catch (error) {
            console.error(error);
            const toastContainer = document.getElementById('toast-container');
            const toast = document.createElement('meeting-toast') as MeetingToast;
            toastContainer.appendChild(toast);
            toast.message = `Failed to update attendee capabilities. Please be aware that you can't set content capabilities to "SendReceive" or "Receive" unless you set video capabilities to "SendReceive" or "Receive". Refer to the Amazon Chime SDK guide and the console for additional information.`;
            toast.delay = '15000';
            toast.show();
            const onHidden = () => {
              toast.removeEventListener('hidden.bs.toast', onHidden);
              toastContainer.removeChild(toast);
            };
            toast.addEventListener('hidden.bs.toast', onHidden);
          }
        };
        saveButton.addEventListener('click', onClickSaveButton);

        attendeeCapabilitiesModal.addEventListener('hide.bs.modal', async () => {
          saveButton.removeEventListener('click', onClickSaveButton);
        });
      });
    } else {
      rosterMenuContainer.classList.add('hidden');
      rosterMenuContainer.classList.remove('d-flex');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(str: string, ...args: any[]): void {
    console.log.apply(console, [`[DEMO] ${str}`, ...args]);
  }

  audioVideoDidStartConnecting(reconnecting: boolean): void {
    this.log(`session connecting. reconnecting: ${reconnecting}`);
    if (reconnecting && this.isAbortingOnReconnect()) {
      fatal(Error('reconnect occured with abort-on-reconnect set to true'));
    }
  }

  audioVideoDidStart(): void {
    this.log('session started');
     // Assign the host ID if not already set (e.g., to the current user's attendee ID)
     if (!this.meetingHostId) {
      this.meetingHostId = this.meetingSession.configuration.credentials.attendeeId;
    }
  }

  audioVideoDidStop(sessionStatus: MeetingSessionStatus): void {
    this.log(`session stopped from ${JSON.stringify(sessionStatus)}`);
    if (this.behaviorAfterLeave === 'nothing') {
      return;
    }
    this.log(`resetting stats`);
    this.resetStats();

    const returnToStart = () => {
      switch (this.behaviorAfterLeave) {
        case 'spa':
          this.switchToFlow('flow-authenticate');
          break;
        case 'reload':
          window.location.href = window.location.pathname;
          break;
        // This is useful for testing memory leaks.
        case 'halt': {
          // Wait a moment to make sure cleanup is done.
          setTimeout(() => {
            // Kill all references to code and content.
            // @ts-ignore
            window.app = undefined;
            // @ts-ignore
            window.app_meetingV2 = undefined;
            // @ts-ignore
            window.webpackHotUpdateapp_meetingV2 = undefined;
            document.getElementsByTagName('body')[0].innerHTML = '<b>Gone</b>';
            this.removeFatalHandlers();
          }, 2000);
          break;
        }
      }
    };

    /**
     * This is approximately the inverse of the initialization method above.
     * This work only needs to be done if you want to continue using the page; if
     * your app navigates away or closes the tab when done, you can let the browser
     * clean up.
     */
    const cleanUpResources = async () => {
      // Clean up the timers for this.
      this.audioVideo.unsubscribeFromActiveSpeakerDetector(this.activeSpeakerHandler);

      // Stop listening to attendee presence.
      this.audioVideo.realtimeUnsubscribeToAttendeeIdPresence(this.attendeeIdPresenceHandler);

      // Stop listening to transcript events.
      this.audioVideo.transcriptionController?.unsubscribeFromTranscriptEvent(
        this.transcriptEventHandler
      );

      this.audioVideo.realtimeUnsubscribeToMuteAndUnmuteLocalAudio(
        this.muteAndUnmuteLocalAudioHandler
      );
      this.audioVideo.realtimeUnsubscribeToSetCanUnmuteLocalAudio(this.canUnmuteLocalAudioHandler);
      this.audioVideo.realtimeUnsubscribeFromReceiveDataMessage(DemoMeetingApp.DATA_MESSAGE_TOPIC);

      // Stop watching device changes in the UI.
      this.audioVideo.removeDeviceChangeObserver(this);

      // Stop content share and local video.
      this.audioVideo.stopLocalVideoTile();
      await this.contentShare.stop();

      // Drop the audio output.
      this.audioVideo.unbindAudioElement();
      await this.deviceController.destroy();

      // remove blur event observer
      this.blurProcessor?.removeObserver(this.blurObserver);

      // remove replacement event observer
      this.replacementProcessor?.removeObserver(this.replacementObserver);

      // Stop any video processor.
      await this.chosenVideoTransformDevice?.stop();

      // Stop Voice Focus.
      await this.voiceFocusDevice?.stop();

      // Clean up the loggers so they don't keep their `onload` listeners around.
      setTimeout(async () => {
        await this.meetingEventPOSTLogger?.destroy();
        await this.meetingSessionPOSTLogger?.destroy();
      }, 500);

      if (isDestroyable(this.eventReporter)) {
        this.eventReporter?.destroy();
      }

      await this.blurProcessor?.destroy();
      await this.replacementProcessor?.destroy();

      this.audioVideo = undefined;
      this.voiceFocusDevice = undefined;
      this.meetingSession = undefined;
      this.activeSpeakerHandler = undefined;
      this.currentAudioInputDevice = undefined;
      this.eventReporter = undefined;
      this.blurProcessor = undefined;
      this.replacementProcessor = undefined;

      // Cleanup VideoFxProcessor
      this.videoFxProcessor?.destroy();
      this.videoFxProcessor = undefined;
    };

    const onLeftMeeting = async () => {
      await cleanUpResources();
      returnToStart();
    };

    if (sessionStatus.statusCode() === MeetingSessionStatusCode.MeetingEnded) {
      this.log(`meeting ended`);
      onLeftMeeting();
      return;
    }

    if (sessionStatus.statusCode() === MeetingSessionStatusCode.Left) {
      this.log('left meeting');
      onLeftMeeting();
      return;
    }
  }

  audioVideoWasDemotedFromPrimaryMeeting(status: any): void {
    const message = `Was demoted from primary meeting with status ${status.toString()}`;
    this.log(message);
    this.updateUXForReplicaMeetingPromotionState('demoted');
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('meeting-toast') as MeetingToast;
    toastContainer.appendChild(toast);
    toast.message = message;
    toast.addButton('Retry Promotion', () => {
      this.promoteToPrimaryMeeting();
    });
    toast.show();
  }

  videoAvailabilityDidChange(availability: MeetingSessionVideoAvailability): void {
    const didChange = this.canStartLocalVideo !== availability.canStartLocalVideo;
    this.canStartLocalVideo = availability.canStartLocalVideo;
    this.log(`video availability changed: canStartLocalVideo  ${availability.canStartLocalVideo}`);
    if (didChange && !this.meetingSession.audioVideo.hasStartedLocalVideoTile()) {
      if (!this.canStartLocalVideo) {
        this.enableLocalVideoButton(false, 'Can no longer enable local video in conference.');
      } else {
        // Enable ability to press button again
        this.enableLocalVideoButton(true, 'You can now enable local video in conference.');
      }
    }
  }

  private enableLocalVideoButton(enabled: boolean, warningMessage: string = ''): void {
    this.toggleButton('button-camera', enabled ? 'off' : 'disabled');

    if (warningMessage) {
      const toastContainer = document.getElementById('toast-container');
      const toast = document.createElement('meeting-toast') as MeetingToast;
      toastContainer.appendChild(toast);
      toast.message = warningMessage;
      toast.show();
    }
  }

  private redirectFromAuthentication(quickjoin: boolean = false): void {
    this.meeting = (document.getElementById('inputMeeting') as HTMLInputElement).value;
    this.name = (document.getElementById('inputName') as HTMLInputElement).value;
    this.region = (document.getElementById('inputRegion') as HTMLInputElement).value;
    this.enableSimulcast = (document.getElementById('simulcast') as HTMLInputElement).checked;
    this.enableEventReporting = (document.getElementById(
      'event-reporting'
    ) as HTMLInputElement).checked;
    this.deleteOwnAttendeeToLeave = (document.getElementById(
      'delete-attendee'
    ) as HTMLInputElement).checked;
    this.disablePeriodicKeyframeRequestOnContentSender = (document.getElementById(
      'disable-content-keyframe'
    ) as HTMLInputElement).checked;
    this.allowAttendeeCapabilities = (document.getElementById(
      'allow-attendee-capabilities'
    ) as HTMLInputElement).checked;
    this.enableWebAudio = (document.getElementById('webaudio') as HTMLInputElement).checked;
    this.usePriorityBasedDownlinkPolicy = (document.getElementById(
      'priority-downlink-policy'
    ) as HTMLInputElement).checked;
    this.echoReductionCapability = (document.getElementById(
      'echo-reduction-capability'
    ) as HTMLInputElement).checked;
    this.primaryExternalMeetingId = (document.getElementById(
      'primary-meeting-external-id'
    ) as HTMLInputElement).value;

    const chosenLogLevel = (document.getElementById('logLevelSelect') as HTMLSelectElement).value;
    switch (chosenLogLevel) {
      case 'info':
        this.logLevel = LogLevel.INFO;
        break;
      case 'debug':
        this.logLevel = LogLevel.DEBUG;
        break;
      case 'warn':
        this.logLevel = LogLevel.WARN;
        break;
      case 'error':
        this.logLevel = LogLevel.ERROR;
        break;
      default:
        this.logLevel = LogLevel.OFF;
        break;
    }

    const chosenVideoSendCodec = (document.getElementById('videoCodecSelect') as HTMLSelectElement)
      .value;
    switch (chosenVideoSendCodec) {
      case 'vp8':
        this.videoCodecPreferences = [VideoCodecCapability.vp8()];
        break;
      case 'h264ConstrainedBaselineProfile':
        // If `h264ConstrainedBaselineProfile` is explicitly selected, include VP8 as fallback
        this.videoCodecPreferences = [
          VideoCodecCapability.h264ConstrainedBaselineProfile(),
          VideoCodecCapability.vp8(),
        ];
        break;
      default:
        // If left on 'Meeting Default', use the existing behavior when `setVideoCodecSendPreferences` is not called
        // which should be equivalent to `this.videoCodecPreferences = [VideoCodecCapability.h264ConstrainedBaselineProfile()]`
        break;
    }

    this.audioCapability = (document.getElementById(
      'audioCapabilitySelect'
    ) as HTMLSelectElement).value;
    this.videoCapability = (document.getElementById(
      'videoCapabilitySelect'
    ) as HTMLSelectElement).value;
    this.contentCapability = (document.getElementById(
      'contentCapabilitySelect'
    ) as HTMLSelectElement).value;

    AsyncScheduler.nextTick(
      async (): Promise<void> => {
        let chimeMeetingId: string = '';
        this.showProgress('progress-authenticate');
        try {
          chimeMeetingId = await this.authenticate();
        } catch (error) {
          console.error(error);
          const httpErrorMessage =
            'UserMedia is not allowed in HTTP sites. Either use HTTPS or enable media capture on insecure sites.';
          (document.getElementById('failed-meeting') as HTMLDivElement).innerText = `Meeting ID: ${this.meeting}`;

          (document.getElementById('failed-meeting-error') as HTMLDivElement).innerText =
            window.location.protocol === 'http:' ? httpErrorMessage : error.message;
          this.switchToFlow('flow-failed-meeting');
          return;
        }
        (document.getElementById(
          'meeting-id'
      ) as HTMLSpanElement).innerText = `${this.meeting} (${this.region})`;
      (document.getElementById(
          'chime-meeting-id'
      ) as HTMLSpanElement).innerText = `Meeting ID: ${chimeMeetingId}`;


        (document.getElementById(
          'mobile-chime-meeting-id'
        ) as HTMLSpanElement).innerText = `Meeting ID: ${chimeMeetingId}`;
        (document.getElementById(
          'mobile-attendee-id'
        ) as HTMLSpanElement).innerText = `Attendee ID: ${this.meetingSession.configuration.credentials.attendeeId}`;

        (document.getElementById(
          'desktop-attendee-id'
      ) as HTMLSpanElement).innerText = `Attendee ID: ${this.meetingSession.configuration.credentials.attendeeId}`;
        (document.getElementById('info-meeting') as HTMLSpanElement).innerText = this.meeting;
        (document.getElementById('info-name') as HTMLSpanElement).innerText = this.name;

        if (this.isViewOnly) {
          this.updateUXForViewOnlyMode();
          await this.skipDeviceSelection(false);
          return;
        }
        await this.initVoiceFocus();
        await this.initBackgroundBlur();
        await this.initBackgroundReplacement();
        await this.initAttendeeCapabilityFeature();
        await this.resolveSupportsVideoFX();
        await this.populateAllDeviceLists();
        await this.populateVideoFilterInputList(false);
        await this.populateVideoFilterInputList(true);
        if (this.enableSimulcast) {
          const videoInputQuality = document.getElementById(
            'video-input-quality'
          ) as HTMLSelectElement;
          videoInputQuality.value = '720p';
          this.audioVideo.chooseVideoInputQuality(1280, 720, 15);
          videoInputQuality.disabled = true;
        }

        // `this.primaryExternalMeetingId` may by the join request
        const buttonPromoteToPrimary = document.getElementById('button-promote-to-primary');
        if (!this.primaryExternalMeetingId) {
          buttonPromoteToPrimary.style.display = 'none';
        } else {
          this.setButtonVisibility('button-record-cloud', false);
          this.updateUXForReplicaMeetingPromotionState('demoted');
        }

        if (quickjoin) {
          await this.skipDeviceSelection();
          this.displayButtonStates();
          return;
        }
        this.switchToFlow('flow-devices');
        await this.openAudioInputFromSelectionAndPreview();
        try {
          await this.openVideoInputFromSelection(
            (document.getElementById('video-input') as HTMLSelectElement).value,
            true
          );
        } catch (err) {
          fatal(err);
        }
        await this.openAudioOutputFromSelection();
        this.hideProgress('progress-authenticate');

        // Open the signaling connection while the user is checking their input devices.
        const preconnect = document.getElementById('preconnect') as HTMLInputElement;
        if (preconnect.checked) {
          if (this.joinMuted) {
            this.audioVideo.realtimeMuteLocalAudio();
          }
          this.audioVideo.start({ signalingOnly: true });
        }
      }
    );
  }

  // to call from form-authenticate form
  private async skipDeviceSelection(autoSelectAudioInput: boolean = true): Promise<void> {
    if (autoSelectAudioInput) {
      await this.openAudioInputFromSelection();
    }
    await this.openAudioOutputFromSelection();
    await this.join();
    this.switchToFlow('flow-meeting');
    this.hideProgress('progress-authenticate');
  }

  allowMaxContentShare(): boolean {
    const allowed = new URL(window.location.href).searchParams.get('max-content-share') === 'true';
    if (allowed) {
      return true;
    }
    return false;
  }

  connectionDidBecomePoor(): void {
    this.log('connection is poor');
  }

  connectionDidSuggestStopVideo(): void {
    this.log('suggest turning the video off');
  }

  connectionDidBecomeGood(): void {
    this.log('connection is good now');
  }

  videoSendDidBecomeUnavailable(): void {
    this.log('sending video is not available');
    this.enableLocalVideoButton(false, 'Cannot enable local video due to call being at capacity');
  }

  contentShareDidStart(): void {
    this.toggleButton('button-content-share', 'on');
  }

  contentShareDidStop(): void {
    this.toggleButton('button-content-share', 'off');
  }

  encodingSimulcastLayersDidChange(simulcastLayers: SimulcastLayers): void {
    this.log(
      `current active simulcast layers changed to: ${SimulcastLayerMapping[simulcastLayers]}`
    );
  }

  tileWillBePausedByDownlinkPolicy(tileId: number): void {
    this.log(`Tile ${tileId} will be paused due to insufficient bandwidth`);
    this.videoTileCollection.bandwidthConstrainedTiles.add(tileId);
  }

  tileWillBeUnpausedByDownlinkPolicy(tileId: number): void {
    this.log(`Tile ${tileId} will be resumed due to sufficient bandwidth`);
    this.videoTileCollection.bandwidthConstrainedTiles.delete(tileId);
  }
}

window.addEventListener('load', () => {
  window.demoMeetingAppInstance = new DemoMeetingApp();
});

window.addEventListener('click', event => {
  const liveTranscriptionModal = document.getElementById('live-transcription-modal');
  if (event.target === liveTranscriptionModal) {
    liveTranscriptionModal.style.display = 'none';
  }
});
const defaultQuizAttempt = {
  _id: "", // You will fill this in when saving the attempt.
  quiz_id: "", // You will update this from your quiz data.
  timestamp: new Date().toISOString(),
  user_id: localStorage.getItem('userId') || "", // If there's no user_id, it defaults to an empty string.
  score: 0,
  answers: [
    {
      question_id: 0,
      answer: "",
      correct: false,
    },
  ],
};


// *****************
// DREW FUNCTIONS

// FUNCTION 1 - SUBMIT QUIZ ATTEMPTS
function submitQuizAttempts() {
  const url = "https://app.larq.ai/api/MakeQuizAttempt";
  const storedData = localStorage.getItem('QuizAttempts');
  let quiz_id = localStorage.getItem('quiz_id');
  // let quizID = localStorage.getItem('quizID');
  const QuizAttempts = storedData ? JSON.parse(storedData) : defaultQuizAttempt;
  console.log("QuizAttempts to sent to larq API:",QuizAttempts);
  QuizAttempts['user_id'] = localStorage.getItem('userId') || "";
  QuizAttempts['quiz_id'] = quiz_id || "";
  // QuizAttempts['quizID'] = quizID || "";
  const totalQuestions = (QuizAttempts as any).answers.length;

  // Get QuizAttempts.score by calculating the number of answers.isCorrect === true:
  // DO THIS BUT TAKE INTO ACCOUNT A POSSIBLY NULL RESULT, MEANING A 0: QuizAttempts.score = QuizAttempts.answers.filter((answer: any) => answer.isCorrect).length / totalQuestions;
  
  QuizAttempts.score = QuizAttempts.answers.filter((answer: any) => answer.isCorrect).length / totalQuestions;

  // alert("Your score is: " + QuizAttempts.score);
  fetch(url, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify(QuizAttempts)
  }).then(response => {
      if (!response.ok) {
          return response.text().then(text => {
              throw new Error(`Server responded with status ${response.status}: ${text}`);
          });
      }
      console.log("Quiz attempt submitted successfully.");
  });
}


// DREW FUNCTION VARIABLES
let userId = localStorage.getItem('userId') || '';

const existingAttempts = localStorage.getItem('QuizAttempts');
const quiz_id = localStorage.getItem('quiz_id');

const QuizAttempts: QuizAttempt = existingAttempts 
    ? JSON.parse(existingAttempts) 
    : {
        quiz_id: quiz_id,
        timestamp: new Date().toISOString(),
        user_id: userId,
        score: 0,
        answers:[

        ]
    };


// FUNCTION 1 - CLEAR PREVIOUS QUESTIONS
function clearPreviousQuestions() {
    const questionBlock = document.getElementById("quiz-taker-question");
    const answerBlock = document.getElementById("quiz-taker-answers");
    
    if (questionBlock && answerBlock) {
        questionBlock.innerHTML = "";
        answerBlock.innerHTML = "";
    }
}

// FUNCTION 2 - DISPLAY QUESTIONS IN QUIZ HANDLER (TAKING QUIZ)
function displayQuestion(index: number, data: FormData) {
  clearPreviousQuestions(); // Clear previous question and answers

  const question = data.fields[index];
  if (question.type === "dropdown") {
    document.getElementById("quiz-taker-question")!.textContent = question.label;

    const answersContainer = document.getElementById("quiz-taker-answers")!;
    // Shuffle the options
    const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);
    // Find the correct answer index in the shuffled options
    const correctAnswerIndex = shuffledOptions.indexOf(question.correct_answer);

    shuffledOptions.forEach((option, optionIndex) => {
      const radioDiv = document.createElement("div");
      radioDiv.className = "form-check form-check-inline radioBox";

      const input = document.createElement("input");
      input.type = "radio";
      input.id = `answer_${index}_${optionIndex}`;
      input.name = `question_${index}`;
      let optionSelected = false;

      input.addEventListener("change", () => {
        if (!optionSelected) {
          optionSelected = true;
        const correctAnswer = question.correct_answer;
        // set a boolean variable to true if attempt has been made:
        let attempted = false;

        if (!attempted){
        if (option === correctAnswer) {
            QuizAttempts.answers.push({
              questionNumber: index,
              answer: option,
              isCorrect: true
            }); 
            attempted = true;
          }
          radioDiv.className = "form-check form-check-inline radioBox incorrect-answer"; // Highlight correct answer with green outline
        } else {
          // same as the other but false
          QuizAttempts.answers.push({
            questionNumber: index,
            answer: option,
            isCorrect: false
          }); 
          attempted = true;

          radioDiv.className = "form-check form-check-inline radioBox correct-answer"; // Highlight correct answer with 
          // find the option with the correct answer and highlight it
          // const correctAnswerIndex = question.options.indexOf(correctAnswer);
          // const correctAnswerInput = document.getElementById(`answer_${index}_${correctAnswerIndex}`) as HTMLInputElement;

          const correctAnswerInput = document.getElementById(`answer_${index}_${correctAnswerIndex}`) as HTMLInputElement;
          correctAnswerInput.parentElement!.className = "form-check form-check-inline radioBox correct-answer";
    

          // correctAnswerInput.parentElement!.className = "form-check form-check-inline radioBox correct-answer";
        } 
      }
      });

      
      const label = document.createElement("label");
      label.className = "form-check-label";
      label.setAttribute("for", input.id);
      label.textContent = option;

      radioDiv.appendChild(input);
      radioDiv.appendChild(label);
      answersContainer.appendChild(radioDiv);
    });
  }
}


// FUNCTION 3 - POPULATE THE QUIZ HANDLER
function populateQuiz(dataString: string) {
        const data: FormData = JSON.parse(dataString);
        // alert with all the data json dumped
        // alert(JSON.stringify(data));
        // save quiz_id to localstorage
        localStorage.setItem('quiz_id', data.quiz_id);
        document.getElementById("quiz-form-title")!.textContent = data.title;
        document.getElementById("quiz-taker-title")!.textContent = data.title;
        
        // Clear previous question
        const questionBlock = document.getElementById("quiz-taker-question");
        const answerBlock = document.getElementById("quiz-taker-answers");
        answerBlock.innerHTML = "";
        if (questionBlock && answerBlock) {
            questionBlock.innerHTML = "";
            answerBlock.innerHTML = "";
        }
    
        data.fields.forEach((field, index) => {
            if (field.type === "dropdown") {
                const question = document.createElement("div");
                question.className = "quiz-title";
                question.style.fontSize = "24px";
                question.textContent = field.label;
                questionBlock?.appendChild(question);

                let answerSelected = false; // New variable to track if an answer has been selected for this question
    
                field.options?.forEach((option, optionIndex) => {
                    const answerOption = document.createElement("div");
                    answerOption.className = "form-check form-check-inline radioBox btn-outline-primary"; // Added btn-outline-primary here
    
                    const input = document.createElement("input");
                    input.type = "checkbox";
                    input.id = `answer-${index}-${optionIndex}`;
                    input.name = `question-${index}`;
                    input.value = option;
                    console.log("populating field ", option);
                    input.className = "btn btn-outline-primary";
                    input.addEventListener("click", () => {
                      if (!answerSelected) {
                        answerSelected = true; // Mark that an answer has been selected
                        const correctAnswer = field.correct_answer;
                          if (option === correctAnswer) {
                            if (!QuizAttempts.answers[index].isCorrect) {
                              QuizAttempts.answers[index].isCorrect = true;
                            
                            }
                            answerOption.classList.add('correct-answer'); // Instead of green outline, add .correct-answer
                          } else {
                            answerOption.classList.add('incorrect-answer'); // Instead of green outline, add .correct-answer
                            // push incorrect answer to QuizAttempts, unles it's already there
                            if (QuizAttempts.answers[index].isCorrect) {
                              QuizAttempts.answers[index].isCorrect = false;
                            }
                              
                          }
      
                          // Disable all other options for this question
                          field.options?.forEach((_, otherOptionIndex) => {
                              if (optionIndex !== otherOptionIndex) {
                                (document.getElementById(`answer-${index}-${otherOptionIndex}`) as HTMLInputElement).disabled = true; 
                              }
                          });
                      }
                  });
      
    
                    const label = document.createElement("label");
                    label.className = "form-check-label";
                    label.htmlFor = input.id;
                    label.textContent = option;
    
                    answerOption.appendChild(input);
                    answerOption.appendChild(label);
                    answerBlock?.appendChild(answerOption);
                });
            }
        });


      let currentQuestionIndex = 0; // To track which question is currently displayed
      

      // When the next button is clicked
      document.getElementById("quiz-taker-next")!.addEventListener("click", () => {
        currentQuestionIndex++;
        if (currentQuestionIndex < data.fields.length) {
          displayQuestion(currentQuestionIndex, data);
        } else {
          QuizAttempts.score = QuizAttempts.answers.filter((answer: any) => answer.isCorrect).length / QuizAttempts.answers.length;
          // You can redirect or show results here when all questions are done.
            alert(`Quiz completed! You got ${QuizAttempts.score} right!`);
            localStorage.setItem('QuizAttempts', JSON.stringify(QuizAttempts));
            submitQuizAttempts();
            document.getElementById("starting_quiz_container")!.style.display = "none";
            document.getElementById("roster-tile-container")!.style.display = "block";
        }
    });

    displayQuestion(currentQuestionIndex, data); // Display the first question initially

    
  }

  // **************************
  // **************************
  // FORUM QUESTION HANDLER
  function showForumQuestion(dataMessage:any, selfID : string, senderName: string) {
    // make sure that "this." refers to the meeting application:

    // alert("showing forum question for dataMessage:"+JSON.stringify(dataMessage) );
    // Sample senderAttendeeId: 1f2e3d4c5b6a7z8y9x0w1v2u3t4s5r6q7p8o9n0m1l2k3j4i5h6g7f8e9d0c1b2a3
    // console.log(`showing forum question: ${dataMessage} selfid - ${selfID}` );
    const data = JSON.parse(dataMessage);
    // Display the question in the forum 
      // Access the DOM elements
      const queriesBlock = document.getElementById('queries-block') as HTMLElement;

      // Create a new query element and populate it with data from ForumQuestion
          // const newQuery = document.createElement('div');

          queriesBlock.innerHTML += `
          <hr>
              <div class="d-flex" data-user-id="${data.senderAttendeeId}">
                  <p class="pe-3 fw-bolder" data-user-id="${data.senderAttendeeId}">${senderName}</p> 
                  <p>Question <span>✋</span></p>
              </div>
              <h5>${data.message}</h5>
              <div class="customInput">
                  <input type="text" data-user-id="${data.senderAttendeeId}" placeholder="Respond" />
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="25" viewBox="0 0 24 25" fill="none" id="send-quiz-comment">
                      <rect x="0.362305" width="23.6375" height="24.2175" rx="4" fill="#F2F2F8" />
                      <path d="M5.71813 13.4979L4.03607 8.25383C3.55455 6.75305 4.86749 5.29226 6.36714 5.66164L19.0245 8.77372C20.6405 9.17066 21.0795 11.3136 19.7556 12.3427L9.38737 20.4057C8.15899 21.3607 6.38381 20.5649 6.2358 18.9924L5.71813 13.4979ZM5.71813 13.4979L12.4654 12.0472" stroke="#3F4149" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
              </div>
          `;

          document.querySelectorAll('.customInput input').forEach((input: HTMLInputElement) => {  // Specify type here
            input.addEventListener('keydown', (e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                const userId = input.getAttribute('data-user-id');
                AsyncScheduler.nextTick(() => {
                  const textArea = input;
                  const textToSend = textArea.value.trim();  // Now TypeScript knows `value` exists

                  if (!textToSend) {
                    return;
                  }
          
                  // alert(`sending Forum Question! ${textToSend}`);
                  let senderName = "Teacher";
                  const messageObject = {
                      message: textToSend,
                      userId: userId,
                      time: Date.now(),
                      selfID: selfID,
                      senderName: senderName
                    };
                
                  window.demoMeetingAppInstance.sendForumMessage(messageObject);
                    
                  // this.sendForumMessage(messageObject);
                          // replace the div with the input and button with the text that was sent as a reply
                  const newReply = document.createElement('p');
                  newReply.className = "forum-reply d-block w-100";
                  newReply.textContent = `Me: ${textToSend}`;
                  input.parentElement!.parentElement!.appendChild(newReply);
                  // alert('added reply to forum question');
                  // input.remove(); 
                  textArea.value = '';

                  });
              }
            });
          });
        
          
          // queriesBlock.appendChild(newQuery);
          
          // Optionally, you can make the 'queries-block' section visible
          queriesBlock.style.display = 'block';

         if (data.userId !== selfID){
          // if the message's "to" is not the person receiving the receiving the message, don't display it
          return;
        } else if (data.userId === selfID){
          // if the message's "to" is the person receiving the receiving the message, display it
          // Create a new query element and populate it with data from ForumQuestion
          // const newQuery = document.createElement('div');
          queriesBlock.innerHTML += `
          <hr>
              <div class="d-flex" data-user-id="${data.senderAttendeeId}">
                  <p class="pe-3 fw-bolder" data-user-id="${data.senderAttendeeId}">${data.senderName}</p> 
                  <p>Question <span>✋</span></p>
              </div>
              <h5>${data.message}</h5>
              <div class="customInput">
                  <input type="text" data-user-id="${data.senderAttendeeId}" placeholder="Respond" />
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="25" viewBox="0 0 24 25" fill="none" id="send-quiz-comment">
                      <rect x="0.362305" width="23.6375" height="24.2175" rx="4" fill="#F2F2F8" />`

            const queries_block = document.getElementById('queries-block2') as HTMLTextAreaElement;
            // add 
            queries_block.innerHTML += `<div class="list-group receive-message" style="flex: 1 1 auto; overflow-y: auto; border: 1px solid rgba(0, 0, 0, 0.125); background-color: #fff"><div class="message-bubble-sender">${data.senderName}</div><div class="message-bubble-self"><p class="markdown">${data.message}</p></div></div>`
            


  }

  };

// FORUM AND IN QUIZ CHAT FUNCTIONS

document.addEventListener('DOMContentLoaded', () => {

// DREW REGISTRATION

const registerButton = document.getElementById('register-button') as HTMLButtonElement;
const registerForm = document.getElementById('registerForm') as HTMLFormElement;
const loginSpinner = document.getElementById('login-spinner') as HTMLElement;

if (registerButton && registerForm && loginSpinner) {
  registerButton.addEventListener('click', (event) => {
    event.preventDefault();
    loginSpinner.style.display = 'block';

    // Use 'registerForm' directly instead of 'event.target'
    const username = registerForm.username.value;
    const password = registerForm.password.value;
    const email = registerForm.email.value;
    const firstName = registerForm.first_name.value;
    const lastName = registerForm.last_name.value;


  fetch("https://app.larq.ai/api/register", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        username: username,
        password: password,
        email: email,
        first_name: firstName,  // Include first name in the request body
        last_name: lastName     // Include last name in the request body
    })
})
.then(response => response.json())
.then(data => {
    if (data.status === 'success') {
    // loginSpinner.style.display = 'none';
    // alert(data.message);
  // alert(data.message);
  console.log('Success:', data);
  localStorage.setItem('authToken', data.token);
  localStorage.setItem('firstName', firstName);
  localStorage.setItem('lastName', lastName);
  localStorage.setItem('userId', data.user_id);
  localStorage.setItem('data', JSON.stringify(data));
  
  // hide #login-spinner
  document.getElementById('login-spinner').style.display = 'none';
  location.reload();

  // Console log user_id and last_name
  console.log("User ID:", data.user_id);
  console.log("Last Name:", data.last_name);
  // console.log("Dashboard Stats:", data.dashboard_stats);


} else {
  document.getElementById('incorrect-pass2')!.innerHTML = data.message;
  document.getElementById('incorrect-pass2')!.style.display = 'block';

}
loginSpinner.style.display = 'none';
})
.catch(error => {
  loginSpinner.style.display = 'none';
  // show #incorrect-pass element 
  document.getElementById('incorrect-pass2')!.style.display = 'block';
  alert(`Error: ${error}`);
});

});
}else {
// alert("HELLLLPP");
console.error("Form or spinner element not found");
}

// END DREW REGISTRATION



console.log("Bottom part of script loaded");
// FUNCTION TO ADD LISTENER TO QUIZFORUM QUESTION
// Get the textarea and messaging container elements
const textarea = document.getElementById('forumContainer') as HTMLTextAreaElement;
const messagingContainer = document.getElementById('messagingContainer');
if (!textarea ) {
  console.error("Textarea not found.");
}
if (!messagingContainer) {
  console.error("Messaging container not found.");
}


// // if enter is selected on the textarea #queries-section, then sendForumMessage of the text with no userId:
// const querytextarea = document.getElementById('queries-section') as HTMLTextAreaElement;
// textarea.addEventListener('keydown', (e: KeyboardEvent) => {
//   if (e.key === 'Enter'){
//     let textToSend = querytextarea.value.trim();
//     let messageObject = {
//       message: textToSend,
//       userId: "",
//       time: Date.now(),
//       senderName: this.meetingSession.configuration.credentials.attendeeId,
//     };
//     sendForumMessage(messageObject);

//   }
// }

// line 5927
// Listen for the 'keydown' event on the textarea
// const textAreaSendMessage = document.getElementById('forumContainer') as HTMLTextAreaElement;
// textarea.addEventListener('keydown', e => {
//   if (e.keyCode === 13) {
//     if (e.shiftKey) {
//       textAreaSendMessage.rows++;
//     } else {
//       e.preventDefault();
//       sendForumMessage();
//       alert("sending Forum Question!");
      
//       // AsyncScheduler.nextTick(() => {
//         // Ensure you're calling these on the correct object, e.g., `this`
//         if (this?.audioVideo && this?.dataMessageHandler && this?.meetingSession) {
//           this.audioVideo.realtimeSendDataMessage(
//             'quizForumQuestion',
//             question,
//             DemoMeetingApp.DATA_MESSAGE_LIFETIME_MS
//           );
      
//           const attendeeId = this.meetingSession.configuration.credentials.attendeeId;
//           const externalUserId = this.meetingSession.configuration.credentials.externalUserId;
      
//           this.dataMessageHandler(
//             new DataMessage(
//               Date.now(),
//               'quizForumQuestion',
//               new TextEncoder().encode(question),
//               attendeeId,
//               externalUserId
//             )
//           );
//         } else {
//           console.error('One or more objects are undefined:', {
//             audioVideo: this?.audioVideo,
//             dataMessageHandler: this?.dataMessageHandler,
//             meetingSession: this?.meetingSession,
//           });
//         }

//                 // Create a new message row with the content and timestamp
//                 const currentTime = new Date();
//                 const formattedTime = currentTime.getHours() + ':' + String(currentTime.getMinutes()).padStart(2, '0') + ' PM';  // Format time as HH:mm PM
//                 const messageRow = `
//                     <div class="send-message">
//                         <h4 class="message-heading">You<span>${formattedTime}</span></h4>
//                         <p class="message-details">${textarea.value}</p>
//                     </div>
//                 `;
                
//                 // Append the new message row to the messaging container
//                 messagingContainer.innerHTML += messageRow;
                
//                 // Clear the textarea
//                 textarea.value = '';  // <-- Use the asserted textarea here
        



//     }
//   }
// });





// 

});
