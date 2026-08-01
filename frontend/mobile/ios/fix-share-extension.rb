#!/usr/bin/env ruby
require "xcodeproj"

project = Xcodeproj::Project.open(File.join(__dir__, "OneClickTrend.xcodeproj"))
ext = project.targets.find { |t| t.name == "OneClickTrendShare" }
abort "extension target missing" unless ext

ext.build_configurations.each do |config|
  config.build_settings["PRODUCT_NAME"] = "OneClickTrendShare"
end

ref = ext.product_reference
puts "product ref before: path=#{ref.path.inspect} name=#{ref.name.inspect}"
ref.path = "OneClickTrendShare.appex"
ref.name = "OneClickTrendShare.appex"

project.save
puts "fixed"
