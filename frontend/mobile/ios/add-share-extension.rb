#!/usr/bin/env ruby
# Adds the OneClickTrendShare share-extension target to the Xcode project.
# Idempotent: skips if the target already exists.
require "xcodeproj"

project_path = File.join(__dir__, "OneClickTrend.xcodeproj")
project = Xcodeproj::Project.open(project_path)

if project.targets.any? { |t| t.name == "OneClickTrendShare" }
  puts "OneClickTrendShare target already exists — nothing to do."
  exit 0
end

app_target = project.targets.find { |t| t.name == "OneClickTrend" }
deployment_target = app_target.build_configurations.first
  .resolve_build_setting("IPHONEOS_DEPLOYMENT_TARGET") || "15.1"

ext = project.new_target(:app_extension, "OneClickTrendShare", :ios, deployment_target)

group = project.main_group.new_group("OneClickTrendShare", "OneClickTrendShare")
swift_ref = group.new_file("ShareViewController.swift")
group.new_file("Info.plist")

ext.add_file_references([swift_ref])

ext.build_configurations.each do |config|
  s = config.build_settings
  s["PRODUCT_BUNDLE_IDENTIFIER"] = "org.reactjs.native.example.OneClickTrend.Share"
  s["INFOPLIST_FILE"] = "OneClickTrendShare/Info.plist"
  s["GENERATE_INFOPLIST_FILE"] = "NO"
  s["SWIFT_VERSION"] = "5.0"
  s["DEVELOPMENT_TEAM"] = "U5U6M2S9Z7"
  s["CODE_SIGN_STYLE"] = "Automatic"
  s["IPHONEOS_DEPLOYMENT_TARGET"] = deployment_target
  s["TARGETED_DEVICE_FAMILY"] = "1"
  s["SKIP_INSTALL"] = "YES"
  s["MARKETING_VERSION"] = "1.0"
  s["CURRENT_PROJECT_VERSION"] = "1"
end

app_target.add_dependency(ext)

embed = app_target.new_copy_files_build_phase("Embed App Extensions")
embed.symbol_dst_subfolder_spec = :plug_ins
build_file = embed.add_file_reference(ext.product_reference)
build_file.settings = { "ATTRIBUTES" => ["CodeSignOnCopy", "RemoveHeadersOnCopy"] }

project.save
puts "OneClickTrendShare target added."
