import AVFoundation
import ExpoModulesCore
import WebRTC

/// WebRTC applies its own audio session configuration when call audio
/// starts (playAndRecord, voiceChat, Bluetooth only), replacing whatever
/// expo-audio set before. In voiceChat mode without `defaultToSpeaker`,
/// iOS plays the remote voice through the earpiece receiver, which is
/// barely audible with the phone held in front of you. This module adds
/// `defaultToSpeaker` to that configuration for the length of a Live
/// conversation. Headphones and Bluetooth still take priority over the
/// speaker, and voiceChat stays on for echo cancellation.
public class OrdiloLiveAudioModule: Module {
  private var originalConfiguration: RTCAudioSessionConfiguration?

  public func definition() -> ModuleDefinition {
    Name("OrdiloLiveAudio")

    Function("enableSpeaker") { () -> Bool in
      let current = RTCAudioSessionConfiguration.webRTC()
      if self.originalConfiguration == nil {
        self.originalConfiguration = current
      }

      let speaker = RTCAudioSessionConfiguration()
      speaker.category = current.category
      speaker.mode = current.mode
      speaker.categoryOptions = current.categoryOptions.union(.defaultToSpeaker)
      speaker.sampleRate = current.sampleRate
      speaker.ioBufferDuration = current.ioBufferDuration
      speaker.inputNumberOfChannels = current.inputNumberOfChannels
      speaker.outputNumberOfChannels = current.outputNumberOfChannels
      RTCAudioSessionConfiguration.setWebRTC(speaker)

      // A call that is already running keeps its old route until the
      // session is configured again, so apply the change right away.
      let session = RTCAudioSession.sharedInstance()
      session.lockForConfiguration()
      defer { session.unlockForConfiguration() }
      if session.isActive {
        do {
          try session.setConfiguration(speaker)
        } catch {
          return false
        }
      }
      return true
    }

    Function("restore") {
      guard let original = self.originalConfiguration else { return }
      RTCAudioSessionConfiguration.setWebRTC(original)
      self.originalConfiguration = nil
    }
  }
}
