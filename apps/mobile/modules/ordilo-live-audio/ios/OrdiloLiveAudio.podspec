Pod::Spec.new do |s|
  s.name           = 'OrdiloLiveAudio'
  s.version        = '1.0.0'
  s.summary        = 'Loudspeaker routing for the Ordilo Live conversation'
  s.description    = 'Adds defaultToSpeaker to the WebRTC audio session configuration while a Live conversation runs.'
  s.author         = 'Ordilo'
  s.homepage       = 'https://ordilo.de'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # The WebRTC build that react-native-webrtc links; its version is pinned there.
  s.dependency 'JitsiWebRTC'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
